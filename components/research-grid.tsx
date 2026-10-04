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
      const semesterTitle = /^\[(\d{4}-[12])\]\s*(.+)$/.exec(item.title)
      return <li key={item.id} className="research-grid-item">
        <Link prefetch={false} href={contentHref(item)} className="research-card group flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-sky-200">
          <div className="research-card-frame">
            {semesterTitle && <span aria-hidden="true" className="research-card-edition">{semesterTitle[1]}</span>}
            <div className="research-card-cover">
              <ReportCover key={`${item.id}:${item.editedAt}:${covers[index]?.url}`} title={item.title} eager={index < 4}
                imageUrl={covers[index]?.url ?? (isDrive ? `/api/content/research/${item.id}/cover` : undefined)}
                fallbackUrl={covers[index] ? `/api/content/research/${item.id}/cover` : undefined}
                pdfUrl={pdf && !isDrive ? `/api/content/research/${item.id}/pdf?${pdf.query}` : undefined} />
            </div>
            {pdf && <span aria-hidden="true" className="research-card-format">PDF</span>}
          </div>
          <div className="research-card-info flex flex-1 flex-col pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CategoryTag name={item.category} color={item.categoryColor} />
              <time dateTime={item.date} className="text-[11px] tabular-nums tracking-wide text-slate-400">{formatDate(item.date)}</time>
            </div>
            <h2 className="mt-3 line-clamp-2 break-words text-xl font-medium leading-7 tracking-tight text-white">
              {semesterTitle ? <><span className="sr-only">[{semesterTitle[1]}] </span>{semesterTitle[2]}</> : item.title}
            </h2>
            {item.summary && <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-slate-400">{item.summary}</p>}
            <div className="mt-auto flex items-center justify-between gap-3 pt-4 pb-4">
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
