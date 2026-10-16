import { contentHref, type ContentItem, type ContentKind } from "./content-model"

export type ContentSearch = {
  q?: string | string[]
  category?: string | string[]
  page?: string | string[]
  semester?: string | string[]
  industry?: string | string[]
  reportType?: string | string[]
  activity?: string | string[]
  company?: string | string[]
  view?: string | string[]
}

export function normalizeContentSearch(search: ContentSearch) {
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : ""
  const category = typeof search.category === "string" ? search.category.trim().slice(0, 100) : ""
  const number = typeof search.page === "string" ? Number(search.page) : NaN
  const page = Number.isSafeInteger(number) && number > 0 ? String(number) : undefined
  const filters: { semester?: string; industry?: string; reportType?: string; activity?: string; company?: string; view?: "list" } = {}
  if (typeof search.semester === "string" && /^\d{4}-[12]$/.test(search.semester)) filters.semester = search.semester
  for (const key of ["industry", "reportType", "activity", "company"] as const) {
    if (typeof search[key] === "string" && search[key].trim()) filters[key] = search[key].trim().slice(0, 100)
  }
  if (search.view === "list") filters.view = "list"
  return { q, category, page, ...filters }
}

function listQuery(search: ContentSearch = {}) {
  const normalized = normalizeContentSearch(search)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(normalized)) if (value) params.set(key, value)
  return params.size ? `?${params}` : ""
}

export function contentListHref(kind: ContentKind, search: ContentSearch = {}) {
  return `/${encodeURIComponent(kind)}${listQuery(search)}`
}

export function contentDetailHref(item: Pick<ContentItem, "kind" | "id">, search?: ContentSearch) {
  return `${contentHref(item)}${listQuery(search)}`
}

export function contentReturnHref(item: Pick<ContentItem, "kind" | "id">, search: ContentSearch = {}) {
  const query = listQuery(search)
  // Only list-origin links carry context. A direct/shared article starts at the list root.
  return `/${encodeURIComponent(item.kind)}${query}${query ? `#content-${encodeURIComponent(item.id)}` : ""}`
}

/** Search data may navigate only within this site, even if an upstream value is malformed. */
export function safeSiteHref(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/search"
  try {
    const url = new URL(value, "https://pnusmp.com")
    return url.origin === "https://pnusmp.com" ? `${url.pathname}${url.search}${url.hash}` : "/search"
  } catch { return "/search" }
}
