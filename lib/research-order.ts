import "server-only"
import { createHash } from "node:crypto"
import { normalizeId, type ContentItem } from "./content-model"
import type { CoverStore } from "./cover-store"

export type OrderBlock = {
  type: string; archived?: boolean; in_trash?: boolean
  [key: string]: unknown
}
type OrderText = {
  type?: string; mention?: { type?: string; page?: { id?: string } }
  text?: { link?: { url?: string } | null }; href?: string | null
}
export type ResearchOrder = { version: 1; keys: string[]; savedAt: string }
const maxEntries = 250

function linkedPageId(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password ||
      !["notion.so", "www.notion.so", "notion.com", "www.notion.com", "app.notion.com"].includes(url.hostname)) return null
    // Ignore query/view IDs and block anchors: only the page in the path counts.
    const last = url.pathname.split("/").filter(Boolean).at(-1) ?? ""
    const match = last.match(/(?:^|-)([a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i)
    return match ? normalizeId(match[1]) : null
  } catch { return null }
}

export function reportIdsFromBlocks(blocks: OrderBlock[]) {
  const ids = new Set<string>()
  for (const block of blocks) {
    if (block.archived || block.in_trash) continue
    if (block.type === "link_to_page") {
      const link = block.link_to_page as { type?: string; page_id?: string } | undefined
      const id = link?.type === "page_id" && link.page_id ? normalizeId(link.page_id) : null
      if (id) ids.add(id)
    } else if (["numbered_list_item", "bulleted_list_item", "paragraph"].includes(block.type)) {
      const value = block[block.type] as { rich_text?: OrderText[] } | undefined
      for (const part of value?.rich_text ?? []) {
        const id = part.mention?.type === "page" && part.mention.page?.id
          ? normalizeId(part.mention.page.id) : linkedPageId(part.text?.link?.url ?? part.href)
        if (id) ids.add(id)
      }
    }
    // Flat list only: never traverse linked pages, databases, or nested content.
    if (ids.size > maxEntries) throw new Error("Research order supports up to 250 references")
  }
  return [...ids]
}

// The public Blob contains only hashes of random page IDs, never draft titles,
// raw page IDs, page content, file URLs, or credentials.
export function orderKey(rawId: string) {
  const id = normalizeId(rawId)
  if (!id) throw new Error("Invalid order page reference")
  return createHash("sha256").update(`smp-research-order:${id}`).digest("base64url")
}
export function orderPath(pageId: string) { return `research-order/${orderKey(pageId)}.json` }

export async function readResearchOrder(store: CoverStore, pageId: string) {
  const stored = await store.read(orderPath(pageId))
  if (!stored) return { order: null, etag: undefined }
  const order = JSON.parse(Buffer.from(stored.bytes).toString("utf8")) as ResearchOrder
  if (order.version !== 1 || !Array.isArray(order.keys) || order.keys.length > maxEntries ||
    order.keys.some(key => typeof key !== "string" || !/^[\w-]{43}$/.test(key)) ||
    new Set(order.keys).size !== order.keys.length || typeof order.savedAt !== "string" || !Number.isFinite(Date.parse(order.savedAt))) {
    throw new Error("Invalid research order snapshot")
  }
  return { order, etag: stored.etag }
}

export function applyResearchOrder(items: ContentItem[], order: ResearchOrder | null) {
  if (!order) return items
  const ranks = new Map(order.keys.map((key, index) => [key, index]))
  // Only reorder the current, source-scoped published list. Missing references
  // append in the existing fallback order; stale/draft links cannot publish.
  return items.map((item, index) => ({ item, index, rank: ranks.get(orderKey(item.id)) ?? Infinity }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ item }) => item)
}

export async function saveResearchOrder(store: CoverStore, pageId: string, loadIds: () => Promise<string[]>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Read the version before fetching Notion. If another worker wins, fetch
    // both again instead of overwriting its newer order with a delayed event.
    const previous = await readResearchOrder(store, pageId)
    // Public Blob get(useCache:false) still uses its CDN. A -> B -> A edits
    // must not be mistaken for an unchanged A from that stale delivery cache.
    const etag = store.version ? await store.version(orderPath(pageId)) : previous.etag
    const keys = [...new Set((await loadIds()).map(orderKey))]
    if (keys.length > maxEntries) throw new Error("Research order supports up to 250 references")
    if (previous.order && previous.etag === etag && JSON.stringify(previous.order.keys) === JSON.stringify(keys)) {
      if (store.version && await store.version(orderPath(pageId)) !== etag) continue
      return { order: previous.order, changed: false }
    }
    const order: ResearchOrder = { version: 1, keys, savedAt: new Date().toISOString() }
    try {
      await store.write(orderPath(pageId), Buffer.from(JSON.stringify(order)), "application/json", { etag })
      return { order, changed: true }
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
  throw new Error("Research order sync unavailable")
}
