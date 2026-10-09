import type { CacheHandler, CacheHandlerValue } from "vinext/shims/cache"
import type { Database } from "./bindings"

// Data only: never store nonce-bearing HTML, private pages, or PDF responses.
// D1 avoids KV's 1,000 writes/day ceiling for the existing 60-second catalog.
export default function createDataCache({ env }: { env: { CMS_DB: Database } }): CacheHandler {
  const db = env.CMS_DB
  if (!db) throw new Error("CMS database is not configured")
  return {
    async get(key) {
      const row = await db.prepare("SELECT value FROM content_cache WHERE key = ? AND expires_at > ?")
        .bind(key, Date.now()).first<{ value: string }>()
      return row ? JSON.parse(row.value) as CacheHandlerValue : null
    },
    async set(key, value, ctx) {
      if (!value) { await db.prepare("DELETE FROM content_cache WHERE key = ?").bind(key).run(); return }
      if (value.kind !== "FETCH") throw new Error("Only data can enter the CMS cache")
      const tags = [...new Set([...(value.tags ?? []), ...(Array.isArray(ctx?.tags) ? ctx.tags as string[] : [])])]
      const now = Date.now()
      const serialized = JSON.stringify({ value, lastModified: now })
      // D1 rows are limited to 2 MB; fail clearly rather than silently lose data.
      if (new TextEncoder().encode(serialized).length > 1_800_000) throw new Error("CMS cache entry too large")
      await db.prepare(`INSERT INTO content_cache (key, value, tags, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, tags = excluded.tags, expires_at = excluded.expires_at`)
        .bind(key, serialized, JSON.stringify(tags), now + 120_000).run()
    },
    async revalidateTag(tags) {
      const list = Array.isArray(tags) ? tags : [tags]
      if (!list.length) return
      await db.prepare(`DELETE FROM content_cache WHERE EXISTS
        (SELECT 1 FROM json_each(content_cache.tags) WHERE value IN (SELECT value FROM json_each(?)))`)
        .bind(JSON.stringify(list)).run()
    },
  }
}
