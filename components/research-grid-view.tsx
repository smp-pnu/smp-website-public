import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { formatDate, type ContentItem } from "@/lib/content-model"
import { contentDetailHref, type ContentSearch } from "@/lib/content-navigation"
import { ResearchGridReveal } from "./research-grid-reveal"
import { CategoryTag } from "./category-tag"
import "./research-grid.css"

export function ResearchGridView({ items, listSearch, renderCover }: { items: ContentItem[]; listSearch?: ContentSearch; renderCover: (item: ContentItem, eager: boolean) => ReactNode }) {
  return <ResearchGridReveal key={items.map(item => item.id).join(",")}>
    {items.map((item, index) => {
      return <li key={item.id} id={`content-${item.id}`} className="research-grid-item scroll-mt-28">
        <Link prefetch={false} href={contentDetailHref(item, listSearch)} className="research-card">
          <div className="research-card-frame">
            <div className="research-card-cover">
              {renderCover(item, index < 3)}
            </div>
          </div>
          <div className="research-card-info">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5"><span className="shrink-0"><CategoryTag name={item.category} color={item.categoryColor} /></span>
                {item.industry && <span title={item.industry} className="truncate text-xs text-slate-400">{item.industry}</span>}
              </div>
              <time dateTime={item.date} className="shrink-0 text-[11px] tabular-nums tracking-wide text-slate-400">{formatDate(item.date)}</time>
            </div>
            <h2 className="mt-3 line-clamp-2 break-words text-xl font-medium leading-7 tracking-tight text-white">
              {item.title}
            </h2>
            {item.summary && <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-400">{item.summary}</p>}
            <div className="flex items-center justify-between gap-3 pt-4">
              <p className="min-w-0 break-words text-[15px] font-medium leading-6 text-slate-300">{item.author}</p>
              <span className="research-card-action flex shrink-0 items-center gap-2 text-xs text-slate-400">
                리포트 읽기<ArrowUpRight aria-hidden="true" className="research-card-arrow h-4 w-4" strokeWidth={1.5} />
              </span>
            </div>
          </div>
        </Link>
      </li>
    })}
  </ResearchGridReveal>
}
