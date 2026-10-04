import "server-only"
import { normalizeId, type ContentItem } from "./content-model"
import { coverStore, coverStorageEnabled } from "./cover-store"
import { notionRequest } from "./notion-request"
import { applyResearchOrder, readResearchOrder, reportIdsFromBlocks, saveResearchOrder, type OrderBlock, type ResearchOrder } from "./research-order"

export function researchOrderPageId() {
  return normalizeId(process.env.NOTION_REPORT_ORDER_PAGE_ID?.trim() ?? "")
}

export async function readOrderPageIds(pageId: string) {
  const page = await notionRequest<{ archived?: boolean; in_trash?: boolean }>(`pages/${pageId}`)
  if (page.archived || page.in_trash) throw new Error("Research order page is archived")
  const blocks: OrderBlock[] = []
  let cursor: string | null = null
  const cursors = new Set<string>()
  do {
    const query = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) })
    const response: { results: OrderBlock[]; has_more: boolean; next_cursor: string | null } = await notionRequest(`blocks/${pageId}/children?${query}`)
    blocks.push(...response.results)
    if (blocks.length > 1000) throw new Error("Research order page is too large")
    if (response.has_more && (!response.next_cursor || cursors.has(response.next_cursor))) throw new Error("Invalid order page pagination")
    cursor = response.has_more ? response.next_cursor : null
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return reportIdsFromBlocks(blocks)
}

// One small Blob read per warm server per minute, shared by simultaneous list
// requests. Visitors never fetch the Notion ordering page or write to storage.
const cached = new Map<string, { order: ResearchOrder | null; until: number }>()
const pendingReads = new Map<string, Promise<ResearchOrder | null>>()
async function savedOrder(pageId: string) {
  const previous = cached.get(pageId)
  if (previous && previous.until > Date.now()) return previous.order
  const pending = pendingReads.get(pageId)
  if (pending) return pending
  const work = (async () => {
    try {
      const { order } = await readResearchOrder(coverStore, pageId)
      cached.set(pageId, { order, until: Date.now() + 60_000 })
      return order
    } catch {
      console.error("[SMP CMS] Research order snapshot unavailable")
      const order = previous?.order ?? null
      cached.set(pageId, { order, until: Date.now() + 60_000 })
      return order
    }
  })()
  pendingReads.set(pageId, work)
  try { return await work } finally { pendingReads.delete(pageId) }
}

export async function applySavedResearchOrder(items: ContentItem[]) {
  const id = researchOrderPageId()
  if (!id || !coverStorageEnabled() || !items.length) return items
  return applyResearchOrder(items, await savedOrder(id))
}

export async function syncResearchOrder() {
  const id = researchOrderPageId()
  if (!id) return { configured: false, changed: false, count: 0 }
  if (!coverStorageEnabled() || !process.env.NOTION_TOKEN) throw new Error("Research order sync is not configured")
  const result = await saveResearchOrder(coverStore, id, () => readOrderPageIds(id))
  // Other instances pick up the persisted snapshot within their 60-second TTL.
  cached.delete(id)
  return { configured: true, changed: result.changed, count: result.order.keys.length, savedAt: result.order.savedAt }
}
