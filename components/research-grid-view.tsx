import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { formatDate, type ContentItem } from "@/lib/content-model"
import { contentDetailHref, type ContentSearch } from "@/lib/content-navigation"
import { CategoryTag } from "./category-tag"
import { publicReportAuthor } from "@/lib/research-metadata"
import "./research-grid.css"

export function ResearchGridView({ items, listSearch, renderCover }: { items: ContentItem[]; listSearch?: ContentSearch; renderCover: (item: ContentItem, eager: boolean) => ReactNode }) {
  return <ul data-card-grid aria-label="리포트 목록" className="grid grid-cols-1 gap-x-7 sm:grid-cols-2 lg:grid-cols-3">
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
                {item.industry && <span title={item.industry} className="truncate text-xs text-site-muted">{item.industry}</span>}
              </div>
              <time dateTime={item.date} className="shrink-0 text-[11px] tabular-nums tracking-wide text-site-muted">{formatDate(item.date)}</time>
            </div>
            <h2 title={item.title} className="research-card-title mt-3 line-clamp-2 break-words text-xl font-medium leading-7 tracking-tight text-white">
              {item.title}
            </h2>
            <p className="research-card-summary mt-2 line-clamp-2 break-words text-sm leading-6 text-site-muted">{item.summary}</p>
            <div className="flex items-center justify-between gap-3 pt-4">
              <p title={publicReportAuthor(item.author)} className="min-w-0 truncate text-[15px] font-medium leading-6 text-site-body">{publicReportAuthor(item.author)}</p>
              <span className="research-card-action flex shrink-0 items-center gap-2 text-xs text-site-muted">
                리포트 읽기<ArrowUpRight aria-hidden="true" className="research-card-arrow h-4 w-4" strokeWidth={1.5} />
              </span>
            </div>
          </div>
        </Link>
      </li>
    })}
  </ul>
}
