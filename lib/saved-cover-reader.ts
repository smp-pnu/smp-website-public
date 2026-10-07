import "server-only"
import type { ContentItem } from "./content-model"
import { coverStore, coverStorageEnabled, type CoverStore } from "./cover-store"
import { driveCoverUrl } from "./report-cover"
import { currentCover, readCover, sourceKey, type SavedCover } from "./cover-metadata"

const ttl = 60_000
const maxEntries = 256

// This caches derived image metadata only, never publication status. Callers
// must supply a report from the current published list. Writers bypass it.
export function createSavedCoverReader(store: CoverStore, now = Date.now) {
  const cached = new Map<string, { cover: SavedCover; until: number }>()
  const pending = new Map<string, Promise<SavedCover | null>>()

  return async function savedCover(item: ContentItem): Promise<SavedCover | null> {
    const previous = cached.get(item.id)
    if (previous && previous.until > now() && currentCover(previous.cover, item)) return previous.cover
    cached.delete(item.id)
    const key = JSON.stringify([item.id, item.editedAt, sourceKey(item)])
    const existing = pending.get(key)
    if (existing) return existing

    const work = (async () => {
      const { cover } = await readCover(store, item.id)
      // A missing/outdated image may be published moments later; do not cache it.
      if (!cover || !currentCover(cover, item)) return null
      cached.set(item.id, { cover, until: now() + ttl })
      if (cached.size > maxEntries) cached.delete(cached.keys().next().value!)
      return cover
    })()
    pending.set(key, work)
    try { return await work } finally { pending.delete(key) }
  }
}

const readSavedCover = createSavedCoverReader(coverStore)
export async function savedReportCover(item: ContentItem) {
  if (!coverStorageEnabled() || !driveCoverUrl(item)) return null
  try {
    return await readSavedCover(item)
  } catch { return null }
}
