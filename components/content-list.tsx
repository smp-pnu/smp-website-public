import Link from "next/link"
import { LayoutGrid, List, X } from "lucide-react"
import type { ContentKind } from "@/lib/content-model"
import { contentDetailHref, contentListHref, type ContentSearch } from "@/lib/content-navigation"
import type { ContentResult } from "@/lib/notion"
import { ResearchGrid } from "@/components/research-grid"
import { ContentRows } from "./content-rows"
import { ResearchPagination } from "./research-pagination"
import { selectContentPage } from "@/lib/content-query"
import { ContentSearchForm, type ContentSuggestion } from "./content-search-form"
import { ResearchSearchForm } from "./research-search-form"

export type { ContentSearch } from "@/lib/content-navigation"

function ContentState({ state, kind }: { state: ContentResult["state"]; kind: ContentKind }) {
  return <p role={state === "error" ? "alert" : "status"} className="border-y border-white/20 px-4 py-20 text-center leading-relaxed text-slate-300">
    {state === "error" ? "목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." : kind === "notice" ? "등록된 공지가 없습니다." : "공개 리포트를 준비하고 있습니다."}
  </p>
}

export function ContentList({ result, kind, search }: { result: ContentResult; kind: ContentKind; search: ContentSearch }) {
  const isResearch = kind === "research"
  const { query, category, categories, semesters, industries, reportTypes, activities, total, totalPages, page, visibleItems, listSearch } = selectContentPage(result.items, kind, search)
  const listView = listSearch.view === "list"
  const activeFilters = (["q", "category", "semester", "industry", "reportType", "activity"] as const)
    .flatMap(key => listSearch[key] ? [{ key, value: listSearch[key] as string }] : [])
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
  else content = isResearch && !listView ? <ResearchGrid items={visibleItems} listSearch={listSearch} /> : <ContentRows items={visibleItems} listSearch={listSearch} />

  return <>
    {isResearch ? <ResearchSearchForm key={JSON.stringify(listSearch)} search={listSearch} semesters={semesters} industries={industries} reportTypes={reportTypes} activities={activities}
      suggestions={result.items.map(({ id, title, summary, author, category, company, ticker, industry, semester, reportType, activity }) => ({ id, kind: "research", title, summary, author, category, company, ticker, industry, semester, reportType, activity }))} />
      : <ContentSearchForm key={`${kind}:${query}:${category}`} kind={kind} query={query} category={category} categories={categories} suggestions={suggestions} />}
    {isResearch && activeFilters.length > 0 && <div aria-label="적용한 검색 조건" className="mt-4 flex flex-wrap items-center gap-2">
      {activeFilters.map(({ key, value }) => <Link key={key} prefetch={false} href={contentListHref(kind, { ...listSearch, [key]: undefined, page: undefined })} aria-label={`${value} 조건 해제`}
        className="inline-flex items-center gap-2 rounded-[3px] border border-white/15 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5">{key === "q" ? `검색: ${value}` : value}<X size={12} aria-hidden="true" /></Link>)}
    </div>}
    <div className={`mb-5 flex items-center justify-between gap-3 ${isResearch ? "mt-5 text-xs tracking-wide text-slate-400" : "mt-8 text-sm text-slate-300"}`}>
      <div className="flex items-center gap-4"><p aria-live="polite">총 {total}건</p>
        {activeFilters.length > 0 && <Link prefetch={false} href={contentListHref(kind, { view: listSearch.view })} className="text-sky-300">검색 초기화</Link>}
      </div>
      {isResearch && <nav aria-label="리포트 보기 방식" className="flex gap-1">
        {[{ view: undefined, label: "그리드 보기", Icon: LayoutGrid, active: !listView }, { view: "list", label: "목록 보기", Icon: List, active: listView }].map(({ view, label, Icon, active }) =>
          <Link key={label} prefetch={false} scroll={false} href={contentListHref(kind, { ...listSearch, view })} aria-label={label} title={label} aria-current={active ? "true" : undefined}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-[2px] border transition-colors ${active ? "border-white/25 bg-white/10 text-white" : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={17} strokeWidth={1.5} aria-hidden="true" /></Link>)}
      </nav>}
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
