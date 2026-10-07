import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { isIP } from "node:net"

export type PublicResource = "pdf" | "download" | "cover" | "search" | "file"
// Generous shared-IP limits accommodate a campus network. This is an instance
// safety net, not a distributed quota or a replacement for Vercel's firewall.
const limits: Record<PublicResource, number> = { pdf: 6000, download: 600, cover: 3000, search: 600, file: 600 }
const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
export function createRequestGuard(now = Date.now, vercel = () => process.env.VERCEL === "1", maxEntries = 4096) {
  const buckets = new Map<string, { tokens: number; updated: number }>()
  const salt = randomBytes(16)
  return function guard(request: Request, resource: PublicResource) {
    // Stop third-party embedding, while allowing links opened by real visitors.
    // Fetch Metadata is browser-provided; server clients still need rate limits.
    if (["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")
      && request.headers.get("sec-fetch-mode") !== "navigate") {
      return new Response("Cross-origin embedding is not allowed", { status: 403, headers: responseHeaders })
    }
    if (!vercel()) return null
    // Vercel overwrites this header. Do not trust arbitrary X-Forwarded-For on
    // self-hosted/local servers; configure the edge before changing this guard.
    const raw = request.headers.get("x-vercel-forwarded-for")?.trim() ?? ""
    const ip = isIP(raw) ? raw : "unknown"
    const key = resource + createHash("sha256").update(salt).update(ip).digest("hex")
    const time = now()
    let bucket = buckets.get(key)
    if (!bucket) {
      if (buckets.size >= maxEntries) {
        for (const [key, value] of buckets) if (time - value.updated > 120_000) buckets.delete(key)
        // Keep existing buckets when full; a flood of fresh IPs cannot evict a
        // throttled client or grow memory without bound.
        if (buckets.size >= maxEntries) return new Response("Temporarily busy", { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } })
      }
      bucket = { tokens: limits[resource], updated: time }
      buckets.set(key, bucket)
    }
    bucket.tokens = Math.min(limits[resource], bucket.tokens + Math.max(0, time - bucket.updated) * limits[resource] / 60_000)
    bucket.updated = time
    if (bucket.tokens < 1) return new Response("Too many requests", { status: 429, headers: { ...responseHeaders, "Retry-After": String(Math.ceil(60 / limits[resource])) } })
    bucket.tokens--
    return null
  }
}
export const guardPublicRequest = createRequestGuard()
