import type { Draft } from "./model"
export type Filter = "all" | "review" | "approved" | "trash"
export type Sort = "order" | "updated" | "date" | "company"
export type LibraryQuery = {
  query: string
  filter: Filter
  sort: Sort
  semester: string
  author: string
  industry: string
}
export type LibraryOrder = { revision: number; ids: string[] }
export type DropPlacement = "before" | "after"
export type BatchAction =
  | { type: "trash" | "restore" | "remove" }
  | { type: "classify"; field: "semester" | "author" | "industry"; value: string }
export const pageSize = 20
export const defaultQuery: LibraryQuery = {
  query: "",
  filter: "all",
  sort: "order",
  semester: "",
  author: "",
  industry: "",
}
export function filterReports(drafts: Draft[], query: LibraryQuery, order: string[]) {
  const ranks = new Map(order.map((id, index) => [id, index]))
  const terms = query.query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return drafts
    .filter((d) => {
      if (query.filter === "trash" ? !d.trashedAt : d.trashedAt) return false
      if (
        (query.filter === "review" && d.approvedRevision === d.revision) ||
        (query.filter === "approved" && d.approvedRevision !== d.revision)
      )
        return false
      if (
        (query.semester && (d.fields.semester || "미지정") !== query.semester) ||
        (query.author && (d.fields.author || "미지정") !== query.author) ||
        (query.industry && (d.fields.industry || "미지정") !== query.industry)
      )
        return false
      const haystack = [d.filename, ...Object.values(d.fields)]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    .sort((a, b) => {
      if (query.sort === "order")
        return (
          (ranks.get(a.id) ?? 1e6) - (ranks.get(b.id) ?? 1e6) ||
          b.fields.date.localeCompare(a.fields.date) ||
          a.id.localeCompare(b.id)
        )
      if (query.sort === "company")
        return (
          a.fields.company.localeCompare(b.fields.company, "ko") || b.fields.date.localeCompare(a.fields.date)
        )
      return query.sort === "date"
        ? b.fields.date.localeCompare(a.fields.date) || a.id.localeCompare(b.id)
        : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
    })
}
export function moveListItem(ids: string[], from: string, to: string, placement?: DropPlacement) {
  const source = ids.indexOf(from),
    target = ids.indexOf(to)
  if (source < 0 || target < 0 || source === target) return ids
  const next = [...ids]
  next.splice(source, 1)
  // Explicit edges refer to the target after removing the source. Arrow moves
  // keep their existing direction-based behavior when no edge is supplied.
  const insertion = placement ? next.indexOf(to) + (placement === "after" ? 1 : 0) : target
  next.splice(insertion, 0, from)
  return next.every((id, index) => id === ids[index]) ? ids : next
}
