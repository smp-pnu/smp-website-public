import { normalizeId } from "../../lib/content-model"
import type { ContentResult } from "../../lib/notion-model"
import { peekApi } from "./api-cache"
import { publicCover,type CoveredItem } from "../../lib/public-cover"

/** Reuse only metadata already delivered in the public list, never a document. */
export function cachedReportPreview(rawId: string): CoveredItem | undefined {
  const id = normalizeId(rawId)
  if (!id) return
  const catalog = peekApi<ContentResult>("/api/catalog/research")
  if (catalog?.state !== "ready") return
  const item = catalog.items.find(item => item.id === id && item.kind === "research")
  if (!item) return
  const { title, summary, date, category, categoryColor, author, pinned, semester, industry, company, ticker } = item
  // Only reuse the exact public card image already delivered by this fresh list.
  // High-resolution pages and PDF URLs still require the detail publication check.
  const cover=publicCover(item as CoveredItem)
  return { id, kind: "research", title, summary, date, category, categoryColor, author, pinned,
    semester, industry, company, ticker, attachments: [], externalUrl: null,
    ...(cover?{cover:{url:cover.url,width:cover.width,height:cover.height}}:{}) }
}
