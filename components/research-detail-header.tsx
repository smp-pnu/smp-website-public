import { ArrowDownToLine } from "lucide-react"
import { contentHref, formatDate, type ContentItem } from "@/lib/content-model"
import { getPdfSources } from "@/lib/pdf-source"
import { reportCompany, researchFacts } from "@/lib/research-metadata"
import { CategoryTag } from "./category-tag"
import { CopyReportLink } from "./copy-report-link"

export function ResearchDetailHeader({ item }: { item: ContentItem }) {
  const facts = researchFacts(item.summary)
  const company = reportCompany(item)
  const pdf = getPdfSources(item)[0]
  const structured = facts.notRated || facts.targetYear || facts.targetPrice || facts.upside
  return <header className="border-b border-white/20 pb-8">
    <div className="flex flex-wrap items-center gap-3"><CategoryTag name={item.category} color={item.categoryColor} />
      {item.industry && <span className="text-sm text-slate-400">{item.industry}</span>}
      {item.semester && <span className="text-xs text-slate-500">{item.semester}</span>}
    </div>
    <h1 className="mt-4 break-words text-3xl font-medium leading-snug text-white sm:text-4xl">{item.title}</h1>
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
      {company && <span className="text-slate-200">{company}{item.ticker && <span className="ml-2 font-mono text-xs text-slate-400">{item.ticker}</span>}</span>}
      <time dateTime={item.date}>{formatDate(item.date)}</time>{item.author && <span>{item.author}</span>}
    </div>
    {structured ? <dl className="mt-7 grid grid-cols-2 gap-y-5 border-y border-white/10 py-5 sm:grid-cols-3">
      {[["타겟년도", facts.targetYear || "미제시"], ["목표주가", facts.notRated ? "Not Rated" : facts.targetPrice || "미제시"], ["상승여력", facts.notRated ? "—" : facts.upside || "미제시"]].map(([label, value]) =>
        <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className={`mt-2 text-lg font-medium tabular-nums ${label === "상승여력" && facts.upside ? "text-sky-200" : "text-white"}`}>{value}</dd></div>)}
    </dl> : item.summary && <p className="mt-6 leading-8 text-slate-300">{item.summary}</p>}
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {pdf && <a href={`/api/content/research/${item.id}/pdf?${pdf.query}&download=1`} download className="inline-flex min-h-11 items-center gap-2 rounded-[2px] bg-sky-200 px-4 text-sm font-medium text-slate-950 hover:bg-sky-100"><ArrowDownToLine size={15} aria-hidden="true" />PDF 다운로드</a>}
      <CopyReportLink href={contentHref(item)} />
    </div>
    {!!item.investmentPoints?.length && <details className="mt-6 border-t border-white/10 pt-5">
      <summary className="cursor-pointer text-sm text-slate-200">투자 포인트</summary>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">{item.investmentPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
    </details>}
  </header>
}
