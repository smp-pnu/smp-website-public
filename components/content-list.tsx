import Link from "next/link"
import { ArrowUpRight, Search } from "lucide-react"
import { contentHref, formatDate, type ContentItem, type ContentKind } from "@/lib/content-model"
import type { ContentResult } from "@/lib/notion"

export type ContentSearch = { q?: string; category?: string; page?: string }
const PAGE_SIZE = 10

export function ContentState({ state, kind }: { state: ContentResult["state"]; kind: ContentKind }) {
  return <p role={state === "error" ? "alert" : "status"} className="border-y border-white/20 px-4 py-20 text-center leading-relaxed text-slate-300">
    {state === "error" ? "목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." : kind === "notice" ? "등록된 공지가 없습니다." : "공개 리포트를 준비하고 있습니다."}
  </p>
}

export function ContentRows({ items }: { items: ContentItem[] }) {
  return <ul className="divide-y divide-white/20 border-y border-white/20">{items.map(item => <li key={item.id}>
    <Link prefetch={false} href={contentHref(item)} className="group flex items-center justify-between gap-5 px-2 py-7 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-300 sm:px-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {item.pinned && <span className="rounded border border-sky-300/40 px-2 py-1 text-sky-300">고정</span>}
          <span className="text-sky-300">{item.category}</span>
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

export function ContentList({ result, kind, search }: { result: ContentResult; kind: ContentKind; search: ContentSearch }) {
  const query = typeof search.q === "string" ? search.q.trim().slice(0, 100) : ""
  const category = typeof search.category === "string" ? search.category : ""
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const categories = Array.from(new Set(result.items.map(item => item.category))).sort()
  const filtered = result.items.filter(item => (!category || category === item.category) && terms.every(term => `${item.title} ${item.summary} ${item.author} ${item.category}`.toLocaleLowerCase().includes(term)))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(search.page) || 1)))
  const pageHref = (number: number) => `/${kind}?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}), page: String(number) })}`
  return <>
    <form action={`/${kind}`} role="search" className="mt-12 flex flex-col gap-4 sm:flex-row">
      <label className="flex-1"><span className="sr-only">{kind === "notice" ? "공지" : "리포트"} 검색</span><input name="q" type="search" maxLength={100} defaultValue={query} key={query} placeholder="제목, 내용, 작성자 검색" className="w-full border-b border-white/30 bg-black/20 px-4 py-3 text-white placeholder:text-slate-400 focus:outline-sky-300" /></label>
      <label><span className="sr-only">분류</span><select name="category" defaultValue={category} key={category} className="h-full min-h-12 w-full border-b border-white/30 bg-[#101b2d] px-4 py-3 text-white sm:w-40"><option value="">전체 분류</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button className="inline-flex items-center justify-center gap-2 border border-sky-300/40 px-5 py-3 text-sm text-sky-200 hover:bg-sky-300/10" type="submit"><Search size={16} aria-hidden="true" />검색</button>
    </form>
    <div className="mb-5 mt-8 flex justify-between text-sm text-slate-300"><p>총 {filtered.length}건</p>{(query || category) && <Link href={`/${kind}`} className="text-sky-300">검색 초기화</Link>}</div>
    {result.state !== "ready" || !result.items.length ? <ContentState state={result.state} kind={kind} /> : filtered.length ? <ContentRows items={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} /> : <p className="border-y border-white/20 py-20 text-center text-slate-300">검색 결과가 없습니다. 다른 검색어로 검색해보세요.</p>}
    {totalPages > 1 && <nav aria-label="목록 페이지" className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-300">{page > 1 ? <Link href={pageHref(page - 1)} className="text-sky-300">이전</Link> : <span aria-disabled="true" className="text-slate-500">이전</span>}<span aria-current="page">{page} / {totalPages}</span>{page < totalPages ? <Link href={pageHref(page + 1)} className="text-sky-300">다음</Link> : <span aria-disabled="true" className="text-slate-500">다음</span>}</nav>}
  </>
}
