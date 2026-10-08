import type { ContentItem, ContentKind } from "./content-model"
import { normalizeContentSearch, type ContentSearch } from "./content-navigation"
import { industrySector, matchesIndustry } from "./wics"
import { reportActivity, reportCompany, reportType } from "./research-metadata"

export type SearchFields = Pick<ContentItem, "title" | "summary" | "author" | "category">
  & Partial<Pick<ContentItem, "company" | "ticker" | "industry" | "semester" | "reportType" | "activity">>
export type ResearchFilters = Pick<ReturnType<typeof normalizeContentSearch>, "semester" | "industry" | "reportType" | "activity">

export function createContentSearchIndex<T extends SearchFields>(items: T[]) {
  return items.map(item => ({ item, text: [item.title, item.summary, item.author, item.category,
    reportCompany(item), item.ticker, item.industry, industrySector(item.industry), item.semester, item.reportType, item.activity].filter(Boolean).join(" ").toLocaleLowerCase() }))
}

// The list and autocomplete use the same matching rules. Build the index once,
// then stop as soon as autocomplete has enough results; no CMS request is needed.
export function findContentMatches<T extends SearchFields>(
  index: { item: T; text: string }[], query: string, category = "", limit = Infinity,
  filters: ResearchFilters = {},
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches: T[] = []
  if (limit <= 0) return matches
  for (const entry of index) {
    if (category && entry.item.category !== category) continue
    if (filters.semester && entry.item.semester !== filters.semester) continue
    if (filters.industry && !matchesIndustry(entry.item.industry, filters.industry)) continue
    if (filters.reportType && reportType(entry.item) !== filters.reportType) continue
    if (filters.activity && reportActivity(entry.item) !== filters.activity) continue
    if (!terms.every(term => entry.text.includes(term))) continue
    matches.push(entry.item)
    if (matches.length >= limit) break
  }
  return matches
}

export function selectContentPage(items: ContentItem[], kind: ContentKind, search: ContentSearch) {
  const { q: query, category, page: requestedPage, ...extra } = normalizeContentSearch(search)
  const filters = kind === "research" ? extra : {}
  const filtered = findContentMatches(createContentSearchIndex(items), query, category, Infinity, filters)
  const pageSize = kind === "research" ? 12 : 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(totalPages, Number(requestedPage ?? 1))
  return {
    query, category, page, totalPages, total: filtered.length,
    categories: Array.from(new Set(items.map(item => item.category))).sort(),
    semesters: Array.from(new Set(items.flatMap(item => item.semester ? [item.semester] : []))).sort().reverse(),
    industries: Array.from(new Set(items.flatMap(item => item.industry ? [item.industry] : []))).sort((a, b) => a.localeCompare(b, "ko")),
    reportTypes: Array.from(new Set(items.map(reportType))).sort(),
    activities: Array.from(new Set(items.map(reportActivity))).sort((a, b) => a.localeCompare(b, "ko")),
    visibleItems: filtered.slice((page - 1) * pageSize, page * pageSize),
    listSearch: { q: query, category, page: String(page), ...filters },
  }
}
