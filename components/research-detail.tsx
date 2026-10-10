import { Suspense } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { contentHref, formatDate, type ContentItem } from "@/lib/content-model"
import { getContent } from "@/lib/content-catalog"
import { relatedResearch } from "@/lib/research-metadata"

export { ResearchDetailHeader } from "./research-detail-header"

export function RelatedResearch({ item }: { item: ContentItem }) {
  return <Suspense fallback={null}><RelatedResearchList item={item} /></Suspense>
}

async function RelatedResearchList({ item }: { item: ContentItem }) {
  const catalog = await getContent("research")
  const related = relatedResearch(item, catalog.items)
  if (!related) return null
  return <aside aria-label="관련 리포트" className="mt-12 border-t border-white/20 pt-7">
    <h2 className="text-sm font-medium text-slate-200">{related.label}</h2>
    <ul className="mt-4 divide-y divide-white/10">{related.items.map(report => <li key={report.id}>
      <Link prefetch={false} href={contentHref(report)} className="group flex items-center justify-between gap-4 py-4">
        <span className="min-w-0"><span className="block text-sm leading-6 text-slate-200 group-hover:text-sky-200">{report.title}</span><time dateTime={report.date} className="mt-1 block text-xs text-slate-500">{formatDate(report.date)}</time></span>
        <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
      </Link>
    </li>)}</ul>
  </aside>
}
