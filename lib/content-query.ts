import type { ContentItem, ContentKind } from "./content-model"
import { normalizeContentSearch, type ContentSearch } from "./content-navigation"

type SearchFields = Pick<ContentItem, "title" | "summary" | "author" | "category">

export function createContentSearchIndex<T extends SearchFields>(items: T[]) {
  return items.map(item => ({ item, text: `${item.title} ${item.summary} ${item.author} ${item.category}`.toLocaleLowerCase() }))
}

// The list and autocomplete use the same matching rules. Build the index once,
// then stop as soon as autocomplete has enough results; no CMS request is needed.
export function findContentMatches<T extends SearchFields>(
  index: { item: T; text: string }[], query: string, category = "", limit = Infinity,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches: T[] = []
  if (limit <= 0) return matches
  for (const entry of index) {
    if (category && entry.item.category !== category) continue
    if (!terms.every(term => entry.text.includes(term))) continue
    matches.push(entry.item)
    if (matches.length >= limit) break
  }
  return matches
}

export function selectContentPage(items: ContentItem[], kind: ContentKind, search: ContentSearch) {
  const { q: query, category, page: requestedPage } = normalizeContentSearch(search)
  const filtered = findContentMatches(createContentSearchIndex(items), query, category)
  const pageSize = kind === "research" ? 12 : 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(totalPages, Number(requestedPage ?? 1))
  return {
    query, category, page, totalPages, total: filtered.length,
    categories: Array.from(new Set(items.map(item => item.category))).sort(),
    visibleItems: filtered.slice((page - 1) * pageSize, page * pageSize),
    listSearch: { q: query, category, page: String(page) },
  }
}
