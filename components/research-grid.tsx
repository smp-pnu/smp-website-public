import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { contentHref, formatDate, type ContentItem } from "@/lib/content-model"
import { getPdfSources } from "@/lib/pdf-source"
import { ResearchGridReveal } from "./research-grid-reveal"
import { ReportCover } from "./report-cover"
import { savedReportCover } from "@/lib/cover-service"
import { CategoryTag } from "./category-tag"
import "./research-grid.css"

export async function ResearchGrid({ items }: { items: ContentItem[] }) {
  const covers = await Promise.all(items.map(savedReportCover))
  return <ResearchGridReveal key={items.map(item => item.id).join(",")}>
    {items.map((item, index) => {
      const pdf = getPdfSources(item)[0]
      const isDrive = pdf && new URL(pdf.url).hostname === "drive.usercontent.google.com"
      return <li key={item.id} className="research-grid-item">
        <Link prefetch={false} href={contentHref(item)} className="research-card group flex h-full flex-col rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">
          <div className="research-card-frame relative overflow-hidden rounded-xl border border-white/15 bg-slate-200 p-3">
            <div className="research-card-cover overflow-hidden bg-white shadow-lg">
              <ReportCover key={`${item.id}:${item.editedAt}:${covers[index]?.url}`} title={item.title} eager={index < 4}
                imageUrl={covers[index]?.url ?? (isDrive ? `/api/content/research/${item.id}/cover` : undefined)}
                fallbackUrl={covers[index] ? `/api/content/research/${item.id}/cover` : undefined}
                pdfUrl={pdf && !isDrive ? `/api/content/research/${item.id}/pdf?${pdf.query}` : undefined} />
            </div>
            {pdf && <span aria-hidden="true" className="absolute right-5 top-5 rounded bg-slate-950/85 px-2 py-1 text-[10px] font-medium tracking-[0.15em] text-white">PDF</span>}
          </div>
          <div className="research-card-info relative z-10 flex flex-1 flex-col rounded-b-xl border border-white/15 bg-[#101a2b] px-4 pb-4 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <CategoryTag name={item.category} color={item.categoryColor} />
              <time dateTime={item.date} className="text-slate-400">{formatDate(item.date)}</time>
            </div>
            <h2 className="mt-3 line-clamp-2 break-words text-lg font-medium leading-7 text-white transition-colors group-hover:text-sky-200">{item.title}</h2>
            {item.summary && <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-300">{item.summary}</p>}
            <div className="mt-auto flex items-center justify-between gap-3 pt-4">
              <p className="min-w-0 break-words text-[15px] font-medium leading-6 text-slate-300">{item.author}</p>
              <span className="flex shrink-0 items-center gap-1 text-xs text-slate-300">
                리포트 읽기<ArrowUpRight aria-hidden="true" className="research-card-arrow h-4 w-4 text-sky-300" />
              </span>
            </div>
          </div>
        </Link>
      </li>
    })}
  </ResearchGridReveal>
}
