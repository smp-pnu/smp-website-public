import type { ContentKind } from "../../lib/content-model"
import type { Env } from "./types"

type Entry = {body:string; headers:[string,string][]; bytes:number; expires:number}

// Isolate-local, bounded memoization only. Nothing is stored in the CDN or the
// browser: every hit still passes admission and a live database version check.
export class RenderCache {
  private entries = new Map<string, Entry>()
  private bytes = 0
  constructor(private maxBytes = 8 * 1024 * 1024, private maxEntries = 64, private ttl = 600_000) {}

  get(key:string, now = Date.now()) {
    const entry = this.entries.get(key)
    if (!entry) return null
    this.remove(key)
    if (entry.expires <= now) return null
    this.entries.set(key, entry); this.bytes += entry.bytes
    const response = new Response(entry.body, {headers:entry.headers})
    response.headers.append("Server-Timing", 'render-cache;desc="hit"')
    return response
  }

  async put(key:string, response:Response, now = Date.now()) {
    if (response.status !== 200 || response.headers.has("set-cookie") || !/^(text\/html|application\/json)\b/.test(response.headers.get("content-type") ?? "")) return
    const body = await response.clone().text()
    const headers = [...response.headers.entries()]
    // Conservative UTF-16 accounting, including keys/headers. One unusually
    // large notice cannot evict every other page or retain an unbounded body.
    const bytes = 2 * (body.length + key.length + headers.reduce((n,[k,v]) => n+k.length+v.length, 0))
    if (bytes > Math.min(this.maxBytes, 1024 * 1024)) return
    this.remove(key)
    for (const [old, entry] of this.entries) if (entry.expires <= now) this.remove(old)
    while (this.entries.size && (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries)) this.remove(this.entries.keys().next().value!)
    this.entries.set(key, {body,headers,bytes,expires:now+this.ttl}); this.bytes += bytes
  }

  private remove(key:string) {
    const entry = this.entries.get(key)
    if (entry) {this.bytes -= entry.bytes; this.entries.delete(key)}
  }
}

const cache = new RenderCache()
const bindings = new WeakMap<object, number>()
let nextBinding = 0
function bindingId(binding:object) {
  let id = bindings.get(binding)
  if (id === undefined) {id = ++nextBinding; bindings.set(binding,id)}
  return id
}

// Call only AFTER method/origin/rate/publication admission. Legacy Notion
// freshness checks must keep running, so only the managed CMS uses this cache.
export async function rendered(request:Request, env:Env, kind:ContentKind, render:()=>Promise<Response>) {
  const url = new URL(request.url)
  if (!env.CMS_ADMIN_MODE || env.REPORT_PREVIEW || url.search.length > 512) return render()
  const state = await env.CMS_DB.prepare(`SELECT r.version,d.version AS catalogue FROM free_render_versions r
    JOIN free_documents d ON d.name=r.kind WHERE r.kind=?`).bind(kind).first<{version:number;catalogue:number}>()
  // No cached fallback on a failed version lookup. Missing documents also use
  // the normal unavailable/404 handling rather than a previous response.
  if (!state) return render()
  const key = `${bindingId(env.CMS_DB)}:${bindingId(env.ASSETS)}:${kind}:${state.version}:${state.catalogue}:${url.href}`
  const hit = cache.get(key)
  if (hit) return hit
  const response = await render()
  await cache.put(key,response)
  response.headers.append("Server-Timing", 'render-cache;desc="miss"')
  return response
}
