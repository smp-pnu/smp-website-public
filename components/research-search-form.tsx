"use client"

import { useId, useMemo, useState, type KeyboardEvent } from "react"
import Form from "next/form"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react"
import { contentDetailHref, normalizeContentSearch, type ContentSearch } from "@/lib/content-navigation"
import { createContentSearchIndex, findContentMatches, type SearchFields } from "@/lib/content-query"

export type ResearchSuggestion = SearchFields & { id: string; kind: "research" }
type Props = {
  search: ContentSearch
  semesters: string[]
  industries: string[]
  reportTypes: string[]
  activities: string[]
  suggestions: ResearchSuggestion[]
}
const selectClass = "min-h-11 w-full rounded-[2px] border border-white/15 bg-[#111820] px-3 text-sm text-slate-200 focus:outline-sky-300 [color-scheme:dark]"

export function ResearchSearchForm({ search, semesters, industries, reportTypes, activities, suggestions }: Props) {
  const router = useRouter()
  const id = useId()
  const listboxId = `${id}-results`
  const current = normalizeContentSearch(search)
  const [value, setValue] = useState(current.q)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const index = useMemo(() => createContentSearchIndex(suggestions), [suggestions])
  const matches = value.trim() ? findContentMatches(index, value, current.category, 6, current) : []
  const showSuggestions = open && Boolean(value.trim())

  function choose(item: ResearchSuggestion) {
    setOpen(false)
    router.push(contentDetailHref(item, { ...current, q: value, page: "1" }))
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
    { name: "reportType", label: "보고서 종류", options: reportTypes },
    { name: "industry", label: "업종", options: industries },
    { name: "activity", label: "활동", options: activities },
  ] as const
  return <Form action="/research" prefetch={false} role="search" aria-label="리포트 검색" onSubmit={() => setOpen(false)} className="mt-8 border-y border-white/15 py-4">
    {current.view && <input type="hidden" name="view" value={current.view} />}
    {current.category && <input type="hidden" name="category" value={current.category} />}
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full min-w-0 sm:w-auto sm:flex-1" onFocus={() => setOpen(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}>
        <Search aria-hidden="true" size={17} strokeWidth={1.5} className="pointer-events-none absolute left-1 top-3.5 text-slate-400" />
        <label htmlFor={`${id}-query`} className="sr-only">리포트 검색</label>
        <input id={`${id}-query`} name="q" type="search" autoComplete="off" maxLength={100} value={value}
          role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={listboxId}
          aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          onChange={event => { setValue(event.target.value); setActiveIndex(-1); setOpen(true) }} onKeyDown={onKeyDown}
          placeholder="기업명, 종목코드, 리포트 검색" className="min-h-11 w-full bg-transparent py-2.5 pl-8 pr-3 text-sm text-white placeholder:text-slate-400 focus:outline-sky-300" />
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
      <label className="min-w-0 flex-1 sm:max-w-44"><span className="sr-only">학기</span>
        <select name="semester" defaultValue={current.semester || ""} onChange={event => event.currentTarget.form?.requestSubmit()} className={selectClass}>
          <option value="">전체 학기</option>{semesters.map(value => <option key={value} value={value}>{value.replace("-", "년 ")}학기</option>)}
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-[2px] border border-white/20 px-6 text-sm text-slate-200 hover:bg-white/5 focus:outline-sky-300">검색</button>
    </div>
    <details open={Boolean(current.industry || current.reportType || current.activity)} className="mt-3">
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 text-xs text-slate-400 transition-colors hover:text-white [&::-webkit-details-marker]:hidden"><SlidersHorizontal size={14} aria-hidden="true" />상세 필터<span className="text-slate-500">· 종류 / 업종 / 활동</span></summary>
      <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-3">
        {filters.map(({ name, label, options }) => <label key={name} className="space-y-2 text-xs text-slate-400"><span className="block">{label}</span>
          <select name={name} defaultValue={current[name] || ""} onChange={event => event.currentTarget.form?.requestSubmit()} className={selectClass}>
            <option value="">전체 {label}</option>{options.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>)}
      </div>
    </details>
  </Form>
}
