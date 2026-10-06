import { contentHref, type ContentItem, type ContentKind } from "./content-model"

export type ContentSearch = {
  q?: string | string[]
  category?: string | string[]
  page?: string | string[]
}

export function normalizeContentSearch(search: ContentSearch) {
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : ""
  const category = typeof search.category === "string" ? search.category : ""
  const number = typeof search.page === "string" ? Number(search.page) : NaN
  const page = Number.isSafeInteger(number) && number > 0 ? String(number) : undefined
  return { q, category, page }
}

function listQuery(search: ContentSearch = {}) {
  const { q, category, page } = normalizeContentSearch(search)
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}), ...(page ? { page } : {}) })
  return params.size ? `?${params}` : ""
}

export function contentListHref(kind: ContentKind, search: ContentSearch = {}) {
  return `/${kind}${listQuery(search)}`
}

export function contentDetailHref(item: ContentItem, search?: ContentSearch) {
  return `${contentHref(item)}${listQuery(search)}`
}

export function contentReturnHref(item: ContentItem, search: ContentSearch = {}) {
  const query = listQuery(search)
  // Only list-origin links carry context. A direct/shared article starts at the list root.
  return `/${item.kind}${query}${query ? `#content-${item.id}` : ""}`
}
