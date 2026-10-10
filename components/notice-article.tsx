import type { ReactNode } from "react"
import { formatDate, type ContentItem } from "@/lib/content-model"
import "./notice-article.css"

export function NoticeArticle({ item, children, attachments }: {
  item: ContentItem
  children: ReactNode
  attachments: ReactNode
}) {
  const hasAttachments = item.attachments.length > 0 || !!item.externalUrl
  return <article className="notice-article" aria-labelledby="notice-title">
    <header className="notice-article__header">
      <div className="notice-article__measure">
        <p className="notice-article__category">{item.pinned && <span>고정 공지</span>}{item.category || "공지사항"}</p>
        <h1 id="notice-title" className="notice-article__title">{item.title}</h1>
        <p className="notice-article__meta"><time dateTime={item.date}>{formatDate(item.date)}</time>{item.author && <><span aria-hidden="true">·</span><span>{item.author}</span></>}</p>
        {item.summary && <p className="notice-article__summary">{item.summary}</p>}
      </div>
    </header>
    <div className="notice-article__body"><div className="notice-article__measure">{children}</div></div>
    {hasAttachments && <footer className="notice-article__attachments"><div className="notice-article__measure">
      <h2>첨부 및 관련 자료</h2>
      {attachments}
    </div></footer>}
  </article>
}
