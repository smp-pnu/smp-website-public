"use client"

import { useId, useMemo, useState, useTransition, type KeyboardEvent } from "react"
import Form from "next/form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, ArrowUpRight, LayoutGrid, List, RotateCcw, Search, X } from "lucide-react"
import { contentDetailHref, contentListHref, normalizeContentSearch, type ContentSearch } from "@/lib/content-navigation"
import { createContentSearchIndex, findContentMatches, type SearchFields } from "@/lib/content-query"
import { ResearchFilterSelect } from "./research-filter-select"

export type ResearchSuggestion = SearchFields & { id: string; kind: "research" }
type Props = {
  search: ContentSearch
  semesters: string[]
  industries: string[]
  reportTypes: string[]
  activities: string[]
  suggestions: ResearchSuggestion[]
  total: number
}
const semesterLabel = (value: string) => `${value.replace("-", "년 ")}학기`

export function ResearchSearchForm({ search, semesters, industries, reportTypes, activities, suggestions, total }: Props) {
  const router = useRouter()
  const id = useId()
  const listboxId = `${id}-results`
  const current = normalizeContentSearch(search)
  const [value, setValue] = useState(current.q)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isPending, startNavigation] = useTransition()
  const index = useMemo(() => createContentSearchIndex(suggestions), [suggestions])
  const matches = value.trim() ? findContentMatches(index, value, current.category, 6, current) : []
  const showSuggestions = open && Boolean(value.trim())
  const activeFilters = (["q", "category", "semester", "industry", "reportType", "activity"] as const)
    .flatMap(key => current[key] ? [{ key, value: current[key] as string }] : [])

  function navigate(href: string) {
    setOpen(false)
    startNavigation(() => router.push(href, { scroll: false }))
  }

  function choose(item: ResearchSuggestion) {
    setOpen(false)
    startNavigation(() => router.push(contentDetailHref(item, { ...current, q: value, page: "1" })))
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActiveIndex(-1) }
    else if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault(); setOpen(true); setActiveIndex(index => (index + 1) % matches.length)
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault(); setOpen(true); setActiveIndex(index => index <= 0 ? matches.length - 1 : index - 1)
    } else if (event.key === "Enter" && showSuggestions && activeIndex >= 0) {
      event.preventDefault(); choose(matches[activeIndex])
    }
  }
  const filters = [
    { name: "semester", label: "학기", placeholder: "전체 학기", options: semesters.map(value => ({ value, label: semesterLabel(value) })) },
    { name: "reportType", label: "보고서 종류", placeholder: "모든 종류", options: reportTypes.map(value => ({ value, label: value })) },
    { name: "industry", label: "업종", placeholder: "모든 업종", options: industries.map(value => ({ value, label: value })) },
    { name: "activity", label: "활동", placeholder: "모든 활동", options: activities.map(value => ({ value, label: value })) },
  ] as const
  return <Form action="/research" prefetch={false} role="search" aria-label="리포트 검색" aria-busy={isPending}
    onSubmit={event => { event.preventDefault(); navigate(contentListHref("research", { ...current, q: value, page: undefined })) }}
    className="mb-7 mt-10 border-b border-white/15 pb-5 sm:mt-12">
    {current.view && <input type="hidden" name="view" value={current.view} />}
    {current.category && <input type="hidden" name="category" value={current.category} />}
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-4 lg:gap-y-5">
      <div className="col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-normal tracking-tight text-white sm:text-lg">{activeFilters.length ? "검색 결과" : "전체 리포트"}</h2>
        <p role="status" className="text-xs tabular-nums text-slate-400">{isPending ? "검색 중…" : <>총 {total}건</>}</p>
      </div>
      <div className="relative col-span-2 col-start-1 row-start-2 min-w-0 lg:row-start-1 lg:w-96 lg:justify-self-end" onFocus={() => setOpen(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}>
        <div className="flex h-11 items-center rounded-[4px] border border-white/15 bg-white/[0.025] pl-3 transition-colors focus-within:border-sky-200/50 focus-within:bg-white/[0.04]">
        <Search aria-hidden="true" size={16} strokeWidth={1.5} className="shrink-0 text-slate-400" />
        <label htmlFor={`${id}-query`} className="sr-only">리포트 검색</label>
        <input id={`${id}-query`} name="q" type="search" autoComplete="off" maxLength={100} value={value}
          role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={listboxId}
          aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          onChange={event => { setValue(event.target.value); setActiveIndex(-1); setOpen(true) }} onKeyDown={onKeyDown}
          placeholder="기업명, 종목코드, 리포트 검색" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-400 sm:text-sm" />
        <button type="submit" disabled={isPending} aria-label="리포트 검색 실행" title="검색" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-r-[4px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-200 disabled:cursor-wait"><ArrowRight size={17} strokeWidth={1.5} aria-hidden="true" /></button>
        </div>
        {showSuggestions && <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded border border-white/15 bg-[#101821] shadow-2xl">
          <ul id={listboxId} role="listbox" aria-label="검색 추천" className="max-h-80 overflow-y-auto">
            {matches.map((item, index) => <li id={`${listboxId}-${index}`} key={item.id} role="option" aria-selected={activeIndex === index}>
              <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 ${activeIndex === index ? "bg-white/5" : ""}`}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{item.title}</span><span className="mt-1 block truncate text-xs text-slate-400">{[item.category, item.industry, item.semester].filter(Boolean).join(" · ")}</span></span>
                <ArrowUpRight aria-hidden="true" size={15} className="shrink-0 text-slate-500" />
              </button>
            </li>)}
          </ul>
          {!matches.length && <p role="status" className="px-4 py-5 text-sm text-slate-400">현재 조건에 맞는 리포트가 없습니다.</p>}
          <button type="submit" onMouseDown={event => event.preventDefault()} className="flex min-h-11 w-full items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-sky-200 hover:bg-white/5">전체 검색결과 보기<span aria-hidden="true">→</span></button>
        </div>}
      </div>
      <div className="col-span-2 col-start-1 row-start-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-1 lg:row-start-2 lg:max-w-[680px]">
        {filters.map(({ name, label, placeholder, options }) => <ResearchFilterSelect key={name} name={name} label={label} value={current[name] || ""}
          options={[{ value: "", label: placeholder }, ...options]} disabled={isPending}
          onChange={next => navigate(contentListHref("research", { ...current, q: value, [name]: next, page: undefined }))} />)}
      </div>
      <nav aria-label="리포트 보기 방식" className="col-start-2 row-start-1 flex h-11 items-center gap-0.5 rounded-[4px] border border-white/10 bg-white/[0.025] p-1 lg:row-start-2 lg:justify-self-end">
        {[{ view: undefined, label: "그리드 보기", Icon: LayoutGrid, active: current.view !== "list" }, { view: "list", label: "목록 보기", Icon: List, active: current.view === "list" }].map(({ view, label, Icon, active }) =>
          <Link key={label} prefetch={false} scroll={false} href={contentListHref("research", { ...current, view })} aria-label={label} title={label} aria-current={active ? "true" : undefined}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-[2px] transition-colors focus-visible:outline-2 focus-visible:outline-sky-200 ${active ? "bg-white/10 text-white" : "text-slate-500 hover:bg-white/5 hover:text-white"}`}><Icon size={16} strokeWidth={1.5} aria-hidden="true" /></Link>)}
      </nav>
    </div>
    {activeFilters.length > 0 && <div aria-label="적용한 검색 조건" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      {activeFilters.map(({ key, value }) => <Link key={key} prefetch={false} scroll={false} href={contentListHref("research", { ...current, [key]: undefined, page: undefined })} aria-label={`${value} 조건 해제`}
        className="inline-flex min-h-9 max-w-full items-center gap-2 text-xs text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-sky-200"><span className="truncate">{key === "q" ? `검색: ${value}` : key === "semester" ? semesterLabel(value) : value}</span><X size={12} aria-hidden="true" className="shrink-0 text-slate-500" /></Link>)}
      <Link prefetch={false} scroll={false} href={contentListHref("research", { view: current.view })} className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-sky-200"><RotateCcw size={12} aria-hidden="true" />초기화</Link>
      </div>
    }
  </Form>
}
