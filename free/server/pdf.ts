import type { ContentItem } from "../../lib/content-model"
import { getPdfSources } from "../../lib/pdf-source"
import { parsePdfRange } from "../../lib/pdf-range"
import { pdfHeaders, streamPdf } from "../../lib/pdf-response"
import type { Context } from "./types"

const cacheSeconds = 300
const maxCacheBytes = 32 * 1024 * 1024
// Limit cloned in-flight bodies per isolate; concurrent cold readers of one
// PDF need only one cache writer. Other readers keep ordinary streaming.
const pendingWrites = new Map<string, number>()
type PdfCache = Pick<Cache, "match" | "put">

// Call only after visitorPublication has checked the current page. Cache keys
// are internal (the public router rejects /api/cache/*), never public PDF URLs.
export async function publishedPdf(request: Request, item: ContentItem, ctx: Context,
  cache: PdfCache | undefined = (globalThis as unknown as { caches?: { default: PdfCache } }).caches?.default) {
  const url = new URL(request.url)
  const query = url.searchParams.get("source") === "external" ? "source=external" : `index=${url.searchParams.get("index") ?? "0"}`
  const pdf = getPdfSources(item).find(file => file.query === query)
  if (!pdf) return new Response("Not found", { status: 404 })
  const range = request.headers.get("range")
  if (range && !parsePdfRange(range)) return new Response("Unsupported range", { status: 416, headers: pdfHeaders })
  const download = url.searchParams.get("download") === "1"
  let key: Request | undefined
  if (cache && item.editedAt) {
    // A new source, CMS revision, or filename must never reuse the old bytes.
    // Signed source URLs are hashed rather than exposed in keys or diagnostics.
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([item.kind, item.id, item.editedAt, pdf.url, pdf.name])))
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")
    key = new Request(new URL(`/api/cache/pdf/v1/${digest}`, url))
    try {
      const hit = await cache.match(new Request(key, { headers: range ? { Range: range } : {} }))
      if (hit) {
        const age = Date.now() - Number(hit.headers.get("x-smp-pdf-saved-at"))
        if (age >= 0 && age < cacheSeconds * 1000) {
          const result = new Response(hit.body, hit)
          result.headers.delete("x-smp-pdf-saved-at")
          for (const [name, value] of Object.entries(pdfHeaders)) result.headers.set(name, value)
          const disposition = result.headers.get("content-disposition")
          if (disposition) result.headers.set("content-disposition", disposition.replace(/^inline;/, download ? "attachment;" : "inline;"))
          result.headers.set("Server-Timing", 'pdf-cache;desc="HIT"')
          return result
        }
        await hit.body?.cancel()
      }
    } catch { /* A cache outage must fall back to the validated source. */ }
  }
  const response = await streamPdf(pdf.url, pdf.name, download,
    AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]), range)
  response.headers.set("Server-Timing", 'pdf-cache;desc="MISS"')
  const size = Number(response.headers.get("content-length"))
  const started = Date.now()
  for (const [pending, deadline] of pendingWrites) if (deadline <= started) pendingWrites.delete(pending)
  // Cache only a requested, complete inline response. Never turn a range or
  // download into an extra full-file fetch, and never buffer PDF bytes in JS.
  if (cache && key && !download && request.method === "GET" && response.status === 200
    && Number.isSafeInteger(size) && size > 0 && size <= maxCacheBytes
    && !pendingWrites.has(key.url) && pendingWrites.size < 2) {
    const cacheKey = key.url, deadline = started + 185_000
    pendingWrites.set(cacheKey, deadline)
    const stored = response.clone()
    stored.headers.set("Cache-Control", `public, max-age=${cacheSeconds}`)
    stored.headers.set("x-smp-pdf-saved-at", String(Date.now()))
    stored.headers.delete("Server-Timing")
    ctx.waitUntil((async () => {
      try { await cache.put(key, stored) }
      catch { if (stored.body && !stored.body.locked) await stored.body.cancel().catch(() => {}) }
      finally { if (pendingWrites.get(cacheKey) === deadline) pendingWrites.delete(cacheKey) }
    })())
  }
  return response
}
