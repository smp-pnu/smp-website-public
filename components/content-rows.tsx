import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { formatDate, type ContentItem } from "@/lib/content-model"
import { contentDetailHref, type ContentSearch } from "@/lib/content-navigation"
import { CategoryTag } from "./category-tag"

export function ContentRows({ items, listSearch }: { items: ContentItem[]; listSearch?: ContentSearch }) {
  return <ul className="divide-y divide-white/15 border-y border-white/15">{items.map(item => <li key={item.id} id={`content-${item.id}`} className="scroll-mt-28">
    <Link prefetch={false} href={contentDetailHref(item, listSearch)} className="group flex items-center justify-between gap-5 px-2 py-7 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-300 sm:px-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {item.pinned && <span className="rounded border border-sky-300/40 px-2 py-1 text-sky-300">고정</span>}
          {item.kind === "research" ? <CategoryTag name={item.category} color={item.categoryColor} /> : <span className="text-sky-300">{item.category}</span>}
          {item.industry && <span className="text-slate-400">{item.industry}</span>}
          {item.ticker && <span className="font-mono text-slate-400">{item.ticker}</span>}
          <time dateTime={item.date}>{formatDate(item.date)}</time>
          {item.author && <span>{item.author}</span>}
        </div>
        <h2 className="mt-3 break-words text-lg font-medium text-white group-hover:text-sky-200 sm:text-xl">{item.title}</h2>
        {item.summary && <p className="mt-2 line-clamp-2 break-words text-sm leading-7 text-slate-300">{item.summary}</p>}
        {item.attachments.length > 0 && <p className="mt-3 text-xs text-slate-400">첨부파일 {item.attachments.length}개</p>}
      </div>
      <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-sky-300" aria-hidden="true" />
    </Link>
  </li>)}</ul>
}
