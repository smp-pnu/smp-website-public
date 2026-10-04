import type { ContentItem } from "./content-model"

export const dailyCoverLimit = 20

// Stable rotation, independent of title/date edits. Webhooks handle new/edited
// reports immediately; the daily job is a bounded safety net for missed events.
export function coverBatch(items: ContentItem[], now = Date.now()) {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
  const count = Math.min(dailyCoverLimit, sorted.length)
  const start = sorted.length ? (Math.floor(now / 86_400_000) * dailyCoverLimit) % sorted.length : 0
  return Array.from({ length: count }, (_, index) => sorted[(start + index) % sorted.length])
}
