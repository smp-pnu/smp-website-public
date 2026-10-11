import { relatedResearch } from "./research-metadata"
import type { ContentItem } from "./content-model"

export type RelatedReports = { label: string; items: Pick<ContentItem,"id"|"kind"|"title"|"date">[] } | null
export function relatedReports(item:ContentItem,items:ContentItem[]):RelatedReports {
  const group=relatedResearch(item,items)
  return group && {label:group.label,items:group.items.map(({id,kind,title,date})=>({id,kind,title,date}))}
}
