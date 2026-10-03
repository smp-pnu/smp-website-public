import Link from "next/link"
import { notFound } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { NotionContent } from "@/components/notion-content"
import { formatDate, type ContentKind } from "@/lib/content-model"
import { getContentBlocks, getContentItem } from "@/lib/notion"

export async function ContentDetail({ kind, id }: { kind: ContentKind; id: string }) {
  const item = await getContentItem(kind, id)
  if (!item) notFound()
  const blocks = await getContentBlocks(item.id)
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-4xl px-6 py-16 sm:py-20">
    <Link href={`/${kind}`} className="text-sm tracking-widest text-sky-300">← {kind === "notice" ? "NOTICE" : "RESEARCH"}</Link>
    <article className="mt-10">
      <header className="border-b border-white/20 pb-8">
        <p className="text-sm text-sky-300">{item.pinned && "고정 · "}{item.category}</p>
        <h1 className="mt-4 break-words text-3xl font-medium leading-snug text-white sm:text-4xl">{item.title}</h1>
        <p className="mt-5 text-sm text-slate-300"><time dateTime={item.date}>{formatDate(item.date)}</time>{item.author && ` · ${item.author}`}</p>
        {item.summary && <p className="mt-6 leading-8 text-slate-300">{item.summary}</p>}
      </header>
      <div className="py-10"><NotionContent blocks={blocks} /></div>
      {(item.attachments.length > 0 || item.externalUrl) && <section aria-label="첨부 자료" className="border-t border-white/20 pt-7">
        <h2 className="text-lg text-white">첨부 자료</h2>
        <ul className="mt-4 space-y-3">{item.attachments.map((file, index) => <li key={`${file.name}-${index}`}><a href={`/api/content/${kind}/${item.id}/file?index=${index}`} target="_blank" rel="noopener noreferrer" className="break-words text-sky-300 underline underline-offset-4">{file.name} ↗</a></li>)}{item.externalUrl && <li><a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-4">관련 링크 열기 ↗</a></li>}</ul>
      </section>}
    </article>
    <div className="mt-14 border-t border-white/20 pt-7"><Link href={`/${kind}`} className="text-sm text-sky-300">목록으로 돌아가기</Link></div>
  </main><SiteFooter /></>
}
