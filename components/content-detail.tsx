import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { NotionContent } from "@/components/notion-content"
import { ContentAttachments } from "./content-attachments"
import { type ContentItem, type ContentKind } from "@/lib/content-model"
import { NoticeDetailHeader } from "./notice-detail-header"
import { contentReturnHref, type ContentSearch } from "@/lib/content-navigation"
import { getContentItem } from "@/lib/notion"
import { getPublishedBlocks } from "@/lib/content-catalog"
import { RelatedResearch, ResearchDetailHeader } from "./research-detail"

export async function ContentDetail({ kind, id, search }: { kind: ContentKind; id: string; search?: ContentSearch }) {
  const item = await getContentItem(kind, id)
  if (!item) notFound()
  const returnHref = contentReturnHref(item, search)
  return <><SiteHeader /><main data-report-page={kind === "research" ? "detail" : undefined} className={`relative z-10 mx-auto min-h-[75svh] max-w-4xl px-6 py-16 sm:py-20 ${kind === "notice" ? "notice-content notice-detail" : ""}`}>
    <Link prefetch={false} href={returnHref} className="text-sm tracking-widest text-site-accent">← {kind === "notice" ? "NOTICE" : "RESEARCH"}</Link>
    <article className={kind === "notice" ? "notice-article mt-8" : "mt-10"}>
      {kind === "research" ? <ResearchDetailHeader item={item} /> : <NoticeDetailHeader item={item} />}
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
