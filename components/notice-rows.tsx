import Link from "next/link"
import { ArrowUpRight, Paperclip } from "lucide-react"
import { formatDate, type ContentItem } from "@/lib/content-model"
import { contentDetailHref, type ContentSearch } from "@/lib/content-navigation"

/** A quiet news index: date, title, and category stay in predictable columns. */
export function NoticeRows({ items, listSearch }: { items: ContentItem[]; listSearch?: ContentSearch }) {
  return <ul className="notice-index">{items.map(item => <li key={item.id} id={`content-${item.id}`} className="scroll-mt-28">
    <Link prefetch={false} href={contentDetailHref(item, listSearch)} className="notice-entry group">
      <div className="notice-entry__meta">
        <time dateTime={item.date} className="text-sm tabular-nums text-site-muted">{formatDate(item.date)}</time>
        <span className="text-xs text-site-accent">{item.pinned ? "주요 공지" : item.category}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 text-xs text-site-muted">
          {item.pinned && <span className="text-site-accent">{item.category}</span>}
          {item.author && <span>{item.author}</span>}
          {item.attachments.length > 0 && <span className="inline-flex items-center gap-1.5"><Paperclip size={12} aria-hidden="true" />첨부 {item.attachments.length}</span>}
        </div>
        <h2 className="mt-2 text-lg font-medium leading-relaxed tracking-tight text-white group-hover:text-sky-200 sm:text-[22px]">{item.title}</h2>
        {item.summary && <p className="mt-3 line-clamp-2 text-sm leading-7 text-site-body">{item.summary}</p>}
      </div>
      <ArrowUpRight className="editorial-arrow h-5 w-5 self-start text-site-accent" aria-hidden="true" />
    </Link>
  </li>)}</ul>
}
