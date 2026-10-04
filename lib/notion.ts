import "server-only"
import { cache } from "react"
import { normalizeId, sortContent, toContentItem, type ContentItem, type ContentKind, type NotionFile, type NotionPage, type RichText } from "./content-model"

type ListResponse<T> = { results: T[]; has_more: boolean; next_cursor: string | null }
type BlockValue = NotionFile & {
  rich_text?: RichText[]; caption?: RichText[]; url?: string; language?: string
  checked?: boolean; cells?: RichText[][]; has_column_header?: boolean; has_row_header?: boolean
}
export type ContentBlock = {
  id: string; type: string; has_children?: boolean; archived?: boolean; in_trash?: boolean
  children?: ContentBlock[]
  [key: string]: unknown
}
export function blockValue(block: ContentBlock) { return (block[block.type] ?? {}) as BlockValue }

export type ContentResult = { items: ContentItem[]; state: "ready" | "unconfigured" | "error" }

function sourceId(kind: ContentKind) {
  const value = kind === "notice" ? process.env.NOTION_NOTICES_DATA_SOURCE_ID : process.env.NOTION_REPORTS_DATA_SOURCE_ID
  if (!value || !process.env.NOTION_TOKEN) return null
  const id = normalizeId(value.trim())
  if (!id) throw new Error("Invalid Notion data source ID")
  return id
}

async function notionRequest<T>(path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      // Revoked publications and expiring file URLs must not persist in a cache.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return response.json() as Promise<T>
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retry = Number(response.headers.get("retry-after") ?? 1)
      await new Promise(resolve => setTimeout(resolve, Math.min(3, Math.max(1, Number.isFinite(retry) ? retry : 1)) * 1000))
      continue
    }
    // Do not include Notion response bodies, content or secrets in logs/errors.
    throw new Error(`Notion API returned ${response.status}`)
  }
  throw new Error("Notion API unavailable")
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
    let cursor: string | null = null
    do {
      const response: ListResponse<NotionPage> = await notionRequest(`data_sources/${id}/query`, {
        page_size: 100,
        filter: { property: "공개", checkbox: { equals: true } },
        ...(cursor ? { start_cursor: cursor } : {}),
      })
      pages.push(...response.results)
      if (response.has_more && !response.next_cursor) throw new Error("Invalid Notion pagination")
      cursor = response.has_more ? response.next_cursor : null
    } while (cursor)
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
export const getContent = cache(loadContent)

export const getContentItem = cache(async (kind: ContentKind, rawId: string) => {
  const id = normalizeId(rawId)
  if (!id) return null
  const result = await getContent(kind)
  if (result.state === "error") throw new Error("콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")
  return result.items.find(item => item.id === id) ?? null
})

// Only follow children that the renderer supports. Never follow child pages or linked databases.
const childTypes = new Set(["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "quote", "callout", "toggle", "to_do", "column_list", "column", "table"])

export async function getContentBlocks(id: string, depth = 0): Promise<ContentBlock[]> {
  if (depth > 8) throw new Error("Content nesting exceeds the supported depth")
  const blocks: ContentBlock[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) })
    const response: ListResponse<ContentBlock> = await notionRequest(`blocks/${id}/children?${query}`)
    for (const block of response.results) {
      if (block.archived || block.in_trash) continue
      if (block.has_children && childTypes.has(block.type)) block.children = await getContentBlocks(block.id, depth + 1)
      blocks.push(block)
    }
    if (response.has_more && !response.next_cursor) throw new Error("Invalid Notion pagination")
    cursor = response.has_more ? response.next_cursor : null
  } while (cursor)
  return blocks
}
