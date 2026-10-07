import Link from "next/link"
import type { ContentKind } from "@/lib/content-model"
import { contentDetailHref, contentListHref, type ContentSearch } from "@/lib/content-navigation"
import type { ContentResult } from "@/lib/notion"
import { ResearchGrid } from "@/components/research-grid"
import { ContentRows } from "./content-rows"
import { ResearchPagination } from "./research-pagination"
import { selectContentPage } from "@/lib/content-query"
import { ContentSearchForm, type ContentSuggestion } from "./content-search-form"

export type { ContentSearch } from "@/lib/content-navigation"

function ContentState({ state, kind }: { state: ContentResult["state"]; kind: ContentKind }) {
  return <p role={state === "error" ? "alert" : "status"} className="border-y border-white/20 px-4 py-20 text-center leading-relaxed text-slate-300">
    {state === "error" ? "목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." : kind === "notice" ? "등록된 공지가 없습니다." : "공개 리포트를 준비하고 있습니다."}
  </p>
}

export function ContentList({ result, kind, search }: { result: ContentResult; kind: ContentKind; search: ContentSearch }) {
  const isResearch = kind === "research"
  const { query, category, categories, total, totalPages, page, visibleItems, listSearch } = selectContentPage(result.items, kind, search)
  const pageHref = (number: number) => contentListHref(kind, { ...listSearch, page: String(number) })
  const suggestions: ContentSuggestion[] = result.items.map(item => ({
    title: item.title,
    summary: item.summary,
    author: item.author,
    category: item.category,
    href: contentDetailHref(item, listSearch),
  }))
  let content
  if (result.state !== "ready" || !result.items.length) content = <ContentState state={result.state} kind={kind} />
  else if (!total) content = <p className="border-y border-white/20 py-20 text-center text-slate-300">검색 결과가 없습니다. 다른 검색어로 검색해보세요.</p>
  else content = isResearch ? <ResearchGrid items={visibleItems} listSearch={listSearch} /> : <ContentRows items={visibleItems} listSearch={listSearch} />

  return <>
    <ContentSearchForm key={`${kind}:${query}:${category}`} kind={kind} query={query} category={category} categories={categories} suggestions={suggestions} />
    <div className={`mb-5 flex justify-between ${isResearch ? "mt-6 text-xs tracking-wide text-slate-400" : "mt-8 text-sm text-slate-300"}`}>
      <p>총 {total}건</p>
      {(query || category) && <Link prefetch={false} href={`/${kind}`} className="text-sky-300">검색 초기화</Link>}
    </div>
    {content}
    {totalPages > 1 && (isResearch
      ? <ResearchPagination page={page} totalPages={totalPages} pageHref={pageHref} />
      : <nav aria-label="목록 페이지" className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-300">
        {page > 1 ? <Link prefetch={false} href={pageHref(page - 1)} className="text-sky-300">이전</Link>
          : <span aria-disabled="true" className="text-slate-500">이전</span>}
        <span aria-current="page">{page} / {totalPages}</span>
        {page < totalPages ? <Link prefetch={false} href={pageHref(page + 1)} className="text-sky-300">다음</Link>
          : <span aria-disabled="true" className="text-slate-500">다음</span>}
      </nav>)}
  </>
}
