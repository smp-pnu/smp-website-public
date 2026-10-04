import "server-only"
import { normalizeId, type ContentItem } from "./content-model"
import { loadContent, loadContentItem } from "./notion"
import { coverStore, coverStorageEnabled } from "./cover-store"
import { coverPrefix, currentCover, prepareCover, readCover, type SavedCover } from "./cover-cache"
import { driveCoverUrl, fetchReportCover } from "./report-cover"
import { createSavedCoverReader } from "./saved-cover-reader"
import { coverBatch, dailyCoverLimit } from "./cover-schedule"

async function latestReport(id: string) {
  return loadContentItem("research", id)
}

const readSavedCover = createSavedCoverReader(coverStore)
export async function savedReportCover(item: ContentItem) {
  if (!coverStorageEnabled() || !driveCoverUrl(item)) return null
  try {
    return await readSavedCover(item)
  } catch { return null }
}

const pending = new Map<string, Promise<SavedCover | null>>()
export async function ensureReportCover(item: ContentItem, force = false) {
  const url = driveCoverUrl(item)
  if (!coverStorageEnabled() || !url) return null
  const key = `${item.id}:${item.editedAt}:${url}:${force}`
  const existing = pending.get(key)
  if (existing) return existing
  const work = prepareCover({ item, store: coverStore, force,
    fetchImage: async () => (await fetchReportCover(url.replace("w480", "w720"), AbortSignal.timeout(20_000))).bytes,
    latestItem: () => latestReport(item.id),
  })
  pending.set(key, work)
  try { return await work } finally { if (pending.get(key) === work) pending.delete(key) }
}

export async function syncReportCover(rawId: string, force = false) {
  const id = normalizeId(rawId)
  if (!id) return null
  if (!coverStorageEnabled()) throw new Error("Cover storage is not configured")
  const item = await latestReport(id)
  if (item) return ensureReportCover(item, force)
  // Publication was revoked or the page was deleted/moved out of the source.
  await coverStore.remove(await coverStore.paths(coverPrefix(id)))
  return null
}

export async function reconcileReportCovers() {
  if (!coverStorageEnabled()) throw new Error("Cover storage is not configured")
  const result = await loadContent("research")
  if (result.state !== "ready") throw new Error("Reports unavailable")
  let prepared = 0, failed = 0, checked = 0
  // Sequential generation bounds Notion/Drive pressure and image memory use.
  const deadline = Date.now() + 240_000
  const batch = coverBatch(result.items.filter(item => driveCoverUrl(item)))
  for (const item of batch) {
    if (Date.now() > deadline) { failed++; break }
    checked++
    try { if (await ensureReportCover(item, true)) prepared++ } catch { failed++ }
  }
  // Clean only derived images, never the source PDF or Notion content.
  const allPaths = await coverStore.paths("report-covers/", new Date(Date.now() - 86_400_000))
  const liveIds = new Set(result.items.map(item => item.id))
  const orphans = [...new Set(allPaths.map(path => path.split("/")[1]))]
    .filter(id => normalizeId(id) === id && !liveIds.has(id)).slice(0, dailyCoverLimit)
  const ids = [...new Set([...batch.map(item => item.id), ...orphans])]
  for (const id of ids) {
    if (Date.now() > deadline) { failed++; break }
    try {
      const latest = await latestReport(id)
      const paths = allPaths.filter(path => path.startsWith(coverPrefix(id)))
      if (!latest || !driveCoverUrl(latest)) { await coverStore.remove(paths); continue }
      const { cover } = await readCover(coverStore, id)
      if (!cover || !currentCover(cover, latest)) continue
      await coverStore.remove(paths.filter(path => path !== `${coverPrefix(id)}current.json` && path !== `${coverPrefix(id)}${cover.hash}.webp`))
    } catch { failed++ }
  }
  return { prepared, failed, checked, total: result.items.length, limit: dailyCoverLimit }
}
