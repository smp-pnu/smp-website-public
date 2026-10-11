import { formatDate, type ContentItem } from "@/lib/content-model"

export function NoticeDetailHeader({ item }: { item: ContentItem }) {
  return <header className="notice-article-header">
    <p className="editorial-eyebrow">{item.pinned ? "주요 공지 · " : ""}{item.category}</p>
    <h1 className="notice-article-title">{item.title}</h1>
    <p className="notice-article-meta"><time dateTime={item.date}>{formatDate(item.date)}</time>{item.author && <><span aria-hidden="true">/</span><span>{item.author}</span></>}</p>
    {item.summary && <p className="notice-article-summary">{item.summary}</p>}
  </header>
}
