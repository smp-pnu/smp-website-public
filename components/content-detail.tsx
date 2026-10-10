import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { NotionContent } from "@/components/notion-content"
import { ContentAttachments } from "./content-attachments"
import { formatDate, type ContentItem, type ContentKind } from "@/lib/content-model"
import { contentReturnHref, type ContentSearch } from "@/lib/content-navigation"
import { getContentItem } from "@/lib/notion"
import { getPublishedBlocks } from "@/lib/content-catalog"
import { RelatedResearch, ResearchDetailHeader } from "./research-detail"

export async function ContentDetail({ kind, id, search }: { kind: ContentKind; id: string; search?: ContentSearch }) {
  const item = await getContentItem(kind, id)
  if (!item) notFound()
  const returnHref = contentReturnHref(item, search)
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-4xl px-6 py-16 sm:py-20">
    <Link prefetch={false} href={returnHref} className="text-sm tracking-widest text-site-accent">← {kind === "notice" ? "NOTICE" : "RESEARCH"}</Link>
    <article className="mt-10">
      {kind === "research" ? <ResearchDetailHeader item={item} /> : <header className="border-b border-site-line pb-8">
        <p className="text-sm text-site-accent">{item.pinned && "고정 · "}{item.category}</p>
        <h1 className="mt-4 break-words text-3xl font-medium leading-snug text-white sm:text-4xl">{item.title}</h1>
        <p className="mt-5 text-sm text-site-body"><time dateTime={item.date}>{formatDate(item.date)}</time>{item.author && ` · ${item.author}`}</p>
        {item.summary && <p className="mt-6 leading-8 text-site-body">{item.summary}</p>}
      </header>}
      {kind === "research" && <div className="mt-8"><ContentAttachments item={item} /></div>}
      <div className="py-8">
        <Suspense fallback={<p role="status" className="text-sm text-site-muted">본문을 불러오는 중입니다.</p>}>
          <ContentBody item={item} />
        </Suspense>
      </div>
      {kind === "notice" && <ContentAttachments item={item} />}
      {kind === "research" && <RelatedResearch item={item} />}
    </article>
    <div className="mt-14 border-t border-site-line pt-7"><Link prefetch={false} href={returnHref} className="text-sm text-site-accent">목록으로 돌아가기</Link></div>
  </main><SiteFooter /></>
}

async function ContentBody({ item }: { item: ContentItem }) {
  let blocks
  try { blocks = await getPublishedBlocks(item) }
  catch {
    console.warn(`[SMP CMS] ${item.kind} body unavailable: ${item.id}`)
    return <p role="alert" className="text-sm leading-7 text-site-body">본문을 불러오지 못했습니다. 잠시 후 새로고침해주세요.</p>
  }
  return <NotionContent blocks={blocks} />
}
