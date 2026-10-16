import { normalizeId, type ContentItem } from "../../lib/content-model"
import type { ContentResult } from "../../lib/notion-model"
import { peekApi } from "./api-cache"

/** Reuse only metadata already delivered in the public list, never a document. */
export function cachedReportPreview(rawId: string): ContentItem | undefined {
  const id = normalizeId(rawId)
  if (!id) return
  const catalog = peekApi<ContentResult>("/api/catalog/research")
  if (catalog?.state !== "ready") return
  const item = catalog.items.find(item => item.id === id && item.kind === "research")
  if (!item) return
  const { title, summary, date, category, categoryColor, author, pinned, semester, industry, company, ticker } = item
  // Do not pass attachment URLs, covers, body blocks or investment points to
  // the pending screen, even if a future catalog happens to include them.
  return { id, kind: "research", title, summary, date, category, categoryColor, author, pinned,
    semester, industry, company, ticker, attachments: [], externalUrl: null }
}
