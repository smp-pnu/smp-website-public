import { formatDate, type ContentItem } from "@/lib/content-model"

export function NoticeDetailHeader({ item }: { item: ContentItem }) {
  return <header className="notice-article-header">
    <p className="editorial-eyebrow">{item.pinned ? "주요 공지 · " : ""}{item.category}</p>
    <h1 className="mt-5 break-words text-[clamp(1.75rem,3.3vw,2.5rem)] font-medium leading-snug tracking-tight text-white">{item.title}</h1>
    <p className="mt-6 text-sm text-site-muted"><time dateTime={item.date}>{formatDate(item.date)}</time>{item.author && ` · ${item.author}`}</p>
    {item.summary && <p className="notice-article-summary">{item.summary}</p>}
  </header>
}
