import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { formatDate, type ContentItem, type ContentKind } from "@/lib/content-model"
import { contentDetailHref, contentListHref, normalizeContentSearch, type ContentSearch } from "@/lib/content-navigation"
import type { ContentResult } from "@/lib/notion"
import { ResearchGrid } from "@/components/research-grid"
import { CategoryTag } from "./category-tag"
import { ContentSearchForm, type ContentSuggestion } from "./content-search-form"

export type { ContentSearch } from "@/lib/content-navigation"

export function ContentState({ state, kind }: { state: ContentResult["state"]; kind: ContentKind }) {
  return <p role={state === "error" ? "alert" : "status"} className="border-y border-white/20 px-4 py-20 text-center leading-relaxed text-slate-300">
    {state === "error" ? "목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." : kind === "notice" ? "등록된 공지가 없습니다." : "공개 리포트를 준비하고 있습니다."}
  </p>
}

export function ContentRows({ items, listSearch }: { items: ContentItem[]; listSearch?: ContentSearch }) {
  return <ul className="divide-y divide-white/20 border-y border-white/20">{items.map(item => <li key={item.id} id={`content-${item.id}`} className="scroll-mt-28">
    <Link prefetch={false} href={contentDetailHref(item, listSearch)} className="group flex items-center justify-between gap-5 px-2 py-7 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-300 sm:px-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {item.pinned && <span className="rounded border border-sky-300/40 px-2 py-1 text-sky-300">고정</span>}
          {item.kind === "research" ? <CategoryTag name={item.category} color={item.categoryColor} /> : <span className="text-sky-300">{item.category}</span>}
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

function ResearchPagination({ page, totalPages, pageHref }: {
  page: number
  totalPages: number
  pageHref: (page: number) => string
}) {
  const firstPage = Math.floor((page - 1) / 10) * 10 + 1
  const pages = Array.from({ length: Math.min(10, totalPages - firstPage + 1) }, (_, index) => firstPage + index)
  const stepClass = "inline-flex h-11 items-center justify-center rounded-md px-3 text-sm transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"

  return <nav aria-label="목록 페이지" className="mt-10 flex flex-col items-center gap-4">
    <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-3">
      {page > 1
        ? <Link prefetch={false} href={pageHref(page - 1)} rel="prev" className={`order-2 text-slate-300 md:order-1 ${stepClass}`}>이전</Link>
        : <span aria-disabled="true" className="order-2 inline-flex h-11 items-center px-3 text-sm text-slate-600 md:order-1">이전</span>}
      <div className="order-1 flex w-full justify-center md:order-2 md:w-auto">
      <ol className="flex w-full max-w-[236px] flex-wrap justify-center gap-1 md:w-auto md:max-w-none">
        {pages.map(number => <li key={number}>
          <Link prefetch={false} href={pageHref(number)} aria-label={`${number}페이지`} aria-current={number === page ? "page" : undefined}
            className={`flex h-11 min-w-11 items-center justify-center rounded-md border text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${number === page ? "border-sky-300/50 bg-sky-300/15 font-semibold text-sky-200" : "border-transparent text-slate-400 hover:border-white/15 hover:bg-white/5 hover:text-white"}`}>
            {number}
          </Link>
        </li>)}
      </ol>
      </div>
      {page < totalPages
        ? <Link prefetch={false} href={pageHref(page + 1)} rel="next" className={`order-3 text-slate-300 ${stepClass}`}>다음</Link>
        : <span aria-disabled="true" className="order-3 inline-flex h-11 items-center px-3 text-sm text-slate-600">다음</span>}
    </div>
    <p className="text-xs tabular-nums text-slate-500">{page} / {totalPages} 페이지</p>
  </nav>
}

export function ContentList({ result, kind, search }: { result: ContentResult; kind: ContentKind; search: ContentSearch }) {
  const isResearch = kind === "research"
  const { q: query, category, page: requestedPage } = normalizeContentSearch(search)
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const categories = Array.from(new Set(result.items.map(item => item.category))).sort()
  const filtered = result.items.filter(item => (!category || category === item.category) && terms.every(term => `${item.title} ${item.summary} ${item.author} ${item.category}`.toLocaleLowerCase().includes(term)))
  const pageSize = kind === "research" ? 12 : 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(totalPages, Number(requestedPage ?? 1))
  const visibleItems = filtered.slice((page - 1) * pageSize, page * pageSize)
  const listSearch = { q: query, category, page: String(page) }
  const pageHref = (number: number) => contentListHref(kind, { ...listSearch, page: String(number) })
  const suggestions: ContentSuggestion[] = result.items.map(item => ({
    title: item.title,
    summary: item.summary,
    author: item.author,
    category: item.category,
    href: contentDetailHref(item, listSearch),
  }))
  return <>
    <ContentSearchForm key={`${kind}:${query}:${category}`} kind={kind} query={query} category={category} categories={categories} suggestions={suggestions} />
    <div className={`mb-5 flex justify-between ${isResearch ? "mt-6 text-xs tracking-wide text-slate-400" : "mt-8 text-sm text-slate-300"}`}><p>총 {filtered.length}건</p>{(query || category) && <Link href={`/${kind}`} className="text-sky-300">검색 초기화</Link>}</div>
    {result.state !== "ready" || !result.items.length ? <ContentState state={result.state} kind={kind} /> : filtered.length ? kind === "research" ? <ResearchGrid items={visibleItems} listSearch={listSearch} /> : <ContentRows items={visibleItems} listSearch={listSearch} /> : <p className="border-y border-white/20 py-20 text-center text-slate-300">검색 결과가 없습니다. 다른 검색어로 검색해보세요.</p>}
    {totalPages > 1 && (isResearch
      ? <ResearchPagination page={page} totalPages={totalPages} pageHref={pageHref} />
      : <nav aria-label="목록 페이지" className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-300">{page > 1 ? <Link href={pageHref(page - 1)} className="text-sky-300">이전</Link> : <span aria-disabled="true" className="text-slate-500">이전</span>}<span aria-current="page">{page} / {totalPages}</span>{page < totalPages ? <Link href={pageHref(page + 1)} className="text-sky-300">다음</Link> : <span aria-disabled="true" className="text-slate-500">다음</span>}</nav>)}
  </>
}
