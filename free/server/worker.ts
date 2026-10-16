import { fileUrl, normalizeId, type ContentKind, type NotionPage } from "../../lib/content-model"
import { isTrustedAttachmentUrl } from "../../lib/pdf-source"
import { publishedPdf } from "./pdf"
import { limitedBody, validNotionSignature } from "../../lib/webhook-security"
import { publicBudget, spend } from "./budget"
import { rebuildDocuments, storePage, removePage } from "./catalog"
import { runScheduledSync } from "./sync"
import { requestPublisher } from "./publisher"
import { notion, source } from "./notion"
import { visitorPublication } from "./publication"
import { readerPdf } from "./reader-pdf"
import { Busy, type Context, type Env } from "./types"
import { memberPhoto } from "./member-photo"
import { queueDriveCleanup } from "../../lib/drive-cleanup-relay"
import { captureWebhookVerification } from "./webhook-setup"
import { publicPage, readDetail } from "./pages"

declare const __SMP_FIXTURE__: boolean
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin" }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })

async function document(request:Request,env: Env,ctx:Context,name: string) {
  // Check only small state first; cached JSON is never used after its database
  // version changes, or when publication freshness cannot be confirmed.
  const state=await env.CMS_DB.prepare(`SELECT version,(SELECT MIN(checked_at) FROM free_sync WHERE kind=? OR ?='search') AS checked_at FROM free_documents WHERE name=?`)
    .bind(name,name,name).first<{version:number;checked_at:number}>()
  if(!state || (!__SMP_FIXTURE__ && Date.now()-state.checked_at>300_000)) return reply({error:"게시 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요."},503)
  const cache=(globalThis as unknown as {caches?:{default:Cache}}).caches?.default
  const key=new Request(new URL(`/api/cache/${name}?version=${state.version}`,request.url))
  const hit=cache && await cache.match(key)
  if(hit)return hit
  const row=await env.CMS_DB.prepare("SELECT body FROM free_documents WHERE name=? AND version=?").bind(name,state.version).first<{body:string}>()
  if(!row)return reply({error:"목록을 갱신하고 있습니다."},503)
  const response=new Response(row.body,{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300"}})
  if(cache)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}))
  return response
}
async function webhook(request: Request, env: Env, ctx: Context) {
  if (env.SMP_READ_ONLY === "1") return new Response("Not found", { status: 404 })
  const raw = await limitedBody(request)
  const verification = await captureWebhookVerification(raw, env)
  if (verification) return verification
  if (!validNotionSignature(raw, request.headers.get("x-notion-signature"), env.NOTION_WEBHOOK_VERIFICATION_TOKEN)) return reply({ error: "Unauthorized" }, 401)
  await spend(env.CMS_DB, "webhook-day", 500, 86_400_000)
  const event = JSON.parse(raw)
  const eventId=typeof event.id==="string" && /^[a-zA-Z0-9_-]{1,128}$/.test(event.id)?event.id:null
  if(eventId && await env.CMS_DB.prepare("SELECT id FROM free_events WHERE id=? AND expires_at>?").bind(eventId,Date.now()).first()) return reply({received:true})
  const id = event.entity?.type === "page" && typeof event.entity.id === "string" && normalizeId(event.entity.id)
  if (!id || typeof event.type !== "string" || !/^page\.[a-z_]+$/.test(event.type)) return reply({ ignored: true })
  const known=await env.CMS_DB.prepare("SELECT kind FROM free_content WHERE id=?").bind(id).first<{kind:string}>()
  // Never replay an event's old data; always read current Notion state.
  const page = await notion<NotionPage>({...env,NOTION_WORKLOAD:"webhook"}, `pages/${id}`)
  const parent = page?.parent?.type === "data_source_id" && normalizeId(page.parent.data_source_id ?? "")
  const kind = parent && (["research", "notice", "members"] as const).find(kind => source(env, kind) === parent)
  // A report may be created and trashed before the first catalogue poll.
  // Its fresh parent still scopes the hint; Apps Script independently checks
  // trash state, shared references, ownership and the configured Drive folder.
  if (event.type === "page.deleted" && (kind === "research" || known?.kind === "research") && (!page || page.archived || page.in_trash)) await queueDriveCleanup(id, env)
  let changed=false
  if (page && kind) changed=await storePage(env, page, kind)
  else if (!page || page.archived || page.in_trash) {
    changed=await removePage(env,id)
  }
  if(changed) await rebuildDocuments(env,kind?[kind]:known?[known.kind as ContentKind | "members"]:[])
  // Record only completed events: an upstream failure must remain retryable.
  if(eventId) await env.CMS_DB.prepare("INSERT INTO free_events(id,expires_at) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at").bind(eventId,Date.now()+86_400_000).run()
  ctx.waitUntil(requestPublisher(env))
  return reply({ received: true })
}

async function handle(request: Request, env: Env, ctx: Context): Promise<Response> {
  const url = new URL(request.url), path = url.pathname
  if (path === "/api/health") return reply({ ok: true, mode: __SMP_FIXTURE__ ? "fixture" : "free", readOnly: env.SMP_READ_ONLY === "1" })
  if (path.startsWith("/api/internal/")) return reply({ error: "Not found" },404)

  if (path === "/api/notion/webhook" && request.method === "POST") return webhook(request, env, ctx)
  let decodedPath=path
  try { decodedPath=decodeURIComponent(path) } catch { return new Response("Not found",{status:404}) }
  if (decodedPath.startsWith("/_reader-pdfs")) return new Response("Not found",{status:404})
  if (!path.startsWith("/api/")) return publicPage(request,env,ctx,name=>document(request,env,ctx,name))
  if(!/^\/api\/(search$|catalog\/(research|notice|members)$|member-photo\/[a-f0-9]{32}$|(detail|content)\/(research|notice)\/[a-f\d-]{32,36}(\/(pdf|file|block-file))?$)/.test(path)) return new Response("Not found",{status:404})
  const match = /^\/api\/(detail|content)\/(research|notice)\/([a-f\d-]{32,36})(?:\/(pdf|file|block-file))?$/.exec(path)
  const reference=match && normalizeId(match[3])
  const admittedAt=Date.now()
  const denied = await publicBudget(request, env,reference?{id:reference,kind:match![2]}:undefined)
  if (denied) return denied
  const photo=/^\/api\/member-photo\/([a-f0-9]{32})$/.exec(path)
  if(photo)return memberPhoto(env,photo[1])
  if (path === "/api/search") return document(request,env,ctx,"search")
  const catalog = /^\/api\/catalog\/(research|notice|members)$/.exec(path)
  if (catalog) return document(request,env,ctx,catalog[1])
  if (!match) return new Response("Not found", { status: 404 })
  const id = normalizeId(match[3]), kind = match[2] as ContentKind
  if (!id) return new Response("Not found", { status: 404 })
  if (match[1] === "detail" && !match[4]) {
    const value=await readDetail(env,ctx,kind,id,name=>document(request,env,ctx,name))
    return value?reply(value):new Response("Not found",{status:404})
  }
  const publicationAt=Date.now()
  const item = await visitorPublication(env, kind, id)
  if (!item) return new Response("Not found", { status: 404 })
  if (match[4] === "pdf") {
    const pdfAt=Date.now()
    const prepared=await readerPdf(request,item,env,ctx)
    if(prepared) {
      prepared.headers.append("Server-Timing",`pdf-admission;dur=${publicationAt-admittedAt}, pdf-publication;dur=${pdfAt-publicationAt}`)
      return prepared
    }
    if(url.searchParams.has("prepared")) return new Response("Not found",{status:404})
    return publishedPdf(request, item, ctx)
  }
  if(match[4]==="block-file") {
    const block=normalizeId(url.searchParams.get("block")??"")
    if(!block || !await env.CMS_DB.prepare("SELECT block_id FROM free_media WHERE page_id=? AND block_id=?").bind(id,block).first()) return new Response("Not found",{status:404})
    const value=await notion<{type:string;[key:string]:unknown}>(env,`blocks/${block}`)
    const target=value && fileUrl(value[value.type] as Parameters<typeof fileUrl>[0])
    if(!target || !isTrustedAttachmentUrl(target)) return new Response("Not found",{status:404})
    return new Response(null,{status:307,headers:{...headers,Location:target}})
  }
  if (match[4] === "file") {
    const index = Number(url.searchParams.get("index") ?? "0")
    const file = Number.isSafeInteger(index) && index >= 0 && item.attachments[index]
    if (!file || !isTrustedAttachmentUrl(file.url)) return new Response("Not found", { status: 404 })
    return new Response(null, { status: 307, headers: { ...headers, Location: file.url } })
  }
  return new Response("Not found", { status: 404 })
}

export default {
  async fetch(request: Request, env: Env, ctx: Context) {
    if(env.SMP_SYNC_KIND) return new Response("Not found",{status:404})
    let response
    try { response = await handle(request, env, ctx) }
    catch (error) {
      response = error instanceof Busy ? new Response("요청이 많아 잠시 대기 중입니다. 나중에 다시 시도해주세요.", { status: 429, headers: { "Retry-After": String(error.seconds) } }) : reply({ error: "자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }, 503)
      if (!(error instanceof Busy)) console.error("[SMP free] request unavailable", error instanceof Error ? error.message.slice(0,160).replace(/https?:\/\/\S+/g,"[url]") : "unknown")
    }
    const result = new Response(request.method === "HEAD" ? null : response.body, response)
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value)
    if (__SMP_FIXTURE__) result.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
    return result
  },
  async scheduled(event: {scheduledTime?:number}, env: Env, _ctx: Context) {
    const kind=env.SMP_SYNC_KIND
    if (env.SMP_READ_ONLY === "1" || !kind || !["research","notice","members"].includes(kind)) return
    // Three independent CMS sources use three scheduled Workers in the SAME
    // account. Request/API quotas remain shared. Each invocation handles only
    // one small source batch, rather than exceeding Free CPU with three.
    try {
      await runScheduledSync(env,kind,event.scheduledTime)
    } finally {
      // One existing cron is the fallback for missed webhooks/GitHub queue
      // delays. No new Cron Trigger or high-frequency workflow is created.
      if(kind==="research" && Math.floor((event.scheduledTime??Date.now())/60_000)%5===0) await requestPublisher(env)
    }
    if(kind==="research" && Math.floor((event.scheduledTime??Date.now())/60_000)%60===0) {
      // Housekeeping has its own hourly admission: an idle sync may skip this
      // minute, and duplicate cron delivery must not repeat the deletes.
      const now=Date.now(),nextHour=(Math.floor(now/3_600_000)+1)*3_600_000
      const cleanup=await env.CMS_DB.prepare(`INSERT INTO free_controls(name,until_at) VALUES ('sync-housekeeping',?)
        ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<=? RETURNING name`).bind(nextHour,now).first()
      if(!cleanup) return
      await env.CMS_DB.prepare("DELETE FROM free_budget WHERE key IN (SELECT key FROM free_budget WHERE expires_at < ? LIMIT 512)").bind(Date.now() - 86_400_000).run()
      await env.CMS_DB.prepare("DELETE FROM free_events WHERE id IN (SELECT id FROM free_events WHERE expires_at < ? LIMIT 1000)").bind(Date.now()).run()
      await env.CMS_DB.prepare("DELETE FROM free_webhook_setup WHERE expires_at < ?").bind(Date.now()).run()
      await env.CMS_DB.prepare("DELETE FROM free_publication_checks WHERE id IN (SELECT id FROM free_publication_checks WHERE checked_at < ? LIMIT 512)").bind(Date.now()-60_000).run()
    }
  },
}
