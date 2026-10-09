import "server-only"
import { cache } from "react"
import { notionPages, notionRequest, NotionRequestError } from "./notion-request"
import { normalizeId, sortContent, toContentItem, type ContentItem, type ContentKind, type NotionFile, type NotionPage, type RichText } from "./content-model"

export { blockValue } from "./notion-model"
export type { ContentBlock, ContentResult } from "./notion-model"
import type { ContentBlock, ContentResult } from "./notion-model"

function sourceId(kind: ContentKind) {
  const value = kind === "notice" ? process.env.NOTION_NOTICES_DATA_SOURCE_ID : process.env.NOTION_REPORTS_DATA_SOURCE_ID
  if (!value || !process.env.NOTION_TOKEN) return null
  const id = normalizeId(value.trim())
  if (!id) throw new Error("Invalid Notion data source ID")
  return id
}

// Share simultaneous reads in this server instance, then immediately discard the
// result. A later request still checks publication changes against Notion.
const pendingContent = new Map<string, Promise<ContentResult>>()
export async function loadContent(kind: ContentKind): Promise<ContentResult> {
  const key = JSON.stringify([kind, process.env.NOTION_TOKEN,
    kind === "notice" ? process.env.NOTION_NOTICES_DATA_SOURCE_ID : process.env.NOTION_REPORTS_DATA_SOURCE_ID])
  const existing = pendingContent.get(key)
  if (existing) return existing
  const work = queryContent(kind)
  pendingContent.set(key, work)
  try { return await work } finally { if (pendingContent.get(key) === work) pendingContent.delete(key) }
}

async function queryContent(kind: ContentKind): Promise<ContentResult> {
  try {
    const id = sourceId(kind)
    if (!id) return { items: [], state: "unconfigured" }
    const pages: NotionPage[] = []
    for await (const batch of notionPages<NotionPage>(`data_sources/${id}/query`, {
      filter: { property: "공개", checkbox: { equals: true } },
    })) pages.push(...batch)
    const items = pages.flatMap(page => {
      const item = toContentItem(page, kind)
      return item ? [item] : []
    })
    return { items: sortContent(items), state: "ready" }
  } catch (error) {
    console.error(`[SMP CMS] ${kind}:`, error instanceof Error ? error.message : "Request failed")
    return { items: [], state: "error" }
  }
}
const pendingItems = new Map<string, Promise<ContentItem | null>>()
export async function loadContentItem(kind: ContentKind, rawId: string): Promise<ContentItem | null> {
  const id = normalizeId(rawId)
  if (!id) return null
  const source = sourceId(kind)
  if (!source) return null
  const key = JSON.stringify([kind, id, source, process.env.NOTION_TOKEN])
  const existing = pendingItems.get(key)
  if (existing) return existing
  const work = (async () => {
    try {
      const page = await notionRequest<NotionPage>(`pages/${id}`)
      // A page read must not expose arbitrary pages shared with the integration.
      if (normalizeId(page.id) !== id || page.parent?.type !== "data_source_id"
        || normalizeId(page.parent.data_source_id ?? "") !== source) return null
      return toContentItem(page, kind)
    } catch (error) {
      if (error instanceof NotionRequestError && error.status === 404) return null
      throw error
    }
  })()
  pendingItems.set(key, work)
  try { return await work } finally { if (pendingItems.get(key) === work) pendingItems.delete(key) }
}
export const getContentItem = cache(loadContentItem)

// Only follow children that the renderer supports. Never follow child pages or linked databases.
const childTypes = new Set(["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "quote", "callout", "toggle", "to_do", "column_list", "column", "table"])

const pendingBlocks = new Map<string, Promise<ContentBlock[]>>()
export async function getContentBlocks(id: string, depth = 0): Promise<ContentBlock[]> {
  const key = JSON.stringify([id, depth, process.env.NOTION_TOKEN])
  const existing = pendingBlocks.get(key)
  if (existing) return existing
  const work = queryContentBlocks(id, depth)
  pendingBlocks.set(key, work)
  try { return await work } finally { if (pendingBlocks.get(key) === work) pendingBlocks.delete(key) }
}

async function queryContentBlocks(id: string, depth: number): Promise<ContentBlock[]> {
  if (depth > 8) throw new Error("Content nesting exceeds the supported depth")
  const blocks: ContentBlock[] = []
  for await (const batch of notionPages<ContentBlock>(`blocks/${id}/children`)) {
    for (const block of batch) {
      if (block.archived || block.in_trash) continue
      if (block.has_children && childTypes.has(block.type)) block.children = await getContentBlocks(block.id, depth + 1)
      blocks.push(block)
    }
  }
  return blocks
}
