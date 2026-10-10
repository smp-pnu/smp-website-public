"use client"

import { useId, useMemo, useState, useTransition, type KeyboardEvent } from "react"
import Form from "next/form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, RotateCcw, X } from "lucide-react"
import type { ContentKind } from "@/lib/content-model"
import { createContentSearchIndex, findContentMatches } from "@/lib/content-query"
import { contentListHref } from "@/lib/content-navigation"
import { SearchField } from "./search-field"
import { FilterSelect } from "./filter-select"

export type ContentSuggestion = {
  title: string
  summary: string
  author: string
  category: string
  href: string
}

export function ContentSearchForm({
  kind, query, category, categories, suggestions, total,
}: {
  kind: ContentKind
  query: string
  category: string
  categories: string[]
  suggestions: ContentSuggestion[]
  total: number
}) {
  const router = useRouter()
  const id = useId()
  const listboxId = `${id}-suggestions`
  const [value, setValue] = useState(query)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isPending, startNavigation] = useTransition()
  const label = kind === "notice" ? "공지" : "리포트"
  const activeFilters = [{ key: "q", value: query }, { key: "category", value: category }].filter(filter => filter.value)
  const index = useMemo(() => createContentSearchIndex(suggestions), [suggestions])
  const matches = value.trim() ? findContentMatches(index, value, category, 6) : []
  const showSuggestions = open && Boolean(value.trim())

  function navigate(href: string) {
    setOpen(false)
    startNavigation(() => router.push(href, { scroll: false }))
  }

  function choose(href: string) {
    setOpen(false)
    startNavigation(() => router.push(href))
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter finishes Korean/Japanese composition before it selects a suggestion.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
      setActiveIndex(-1)
    } else if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(index => (index + 1) % matches.length)
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(index => index <= 0 ? matches.length - 1 : index - 1)
    } else if (event.key === "Enter" && showSuggestions && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault()
      choose(matches[activeIndex].href)
    }
  }

  return <Form action={`/${kind}`} prefetch={false} role="search" aria-label={`${label} 검색`} aria-busy={isPending}
    onSubmit={event => { event.preventDefault(); navigate(contentListHref(kind, { q: value, category })) }}
    className="mb-7 mt-10 border-b border-white/15 pb-5 sm:mt-12">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 lg:gap-y-5">
      <div className="col-span-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:col-span-1">
        <h2 className="text-base font-normal tracking-tight text-white sm:text-lg">{activeFilters.length ? "검색 결과" : `전체 ${label}`}</h2>
        <p role="status" className="text-xs tabular-nums text-slate-400">{isPending ? "검색 중…" : `총 ${total}건`}</p>
      </div>
      <div className="relative col-span-2 min-w-0 lg:col-span-1 lg:w-96 lg:justify-self-end" onFocus={() => setOpen(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}>
        <SearchField id={`${id}-query`} label={`${label} 검색`} name="q" maxLength={100} autoComplete="off" value={value} isPending={isPending}
          role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={listboxId}
          aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          onChange={event => { setValue(event.currentTarget.value); setActiveIndex(-1); setOpen(true) }} onKeyDown={onSearchKeyDown}
          placeholder="제목, 내용, 작성자 검색" />
        {showSuggestions && <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-[4px] border border-white/15 bg-[#101821] shadow-2xl">
          <ul id={listboxId} role="listbox" aria-label="검색 추천" className="max-h-80 overflow-y-auto">
            {matches.map((item, index) => <li id={`${listboxId}-option-${index}`} key={item.href} role="option" aria-selected={activeIndex === index}>
              <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item.href)}
                className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none ${activeIndex === index ? "bg-white/5" : ""}`}>
                <span className="min-w-0"><span className="block truncate text-sm text-white">{item.title}</span><span className="mt-1 block truncate text-xs text-slate-400">{item.category}{item.author ? ` · ${item.author}` : ""}</span></span>
                <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            </li>)}
          </ul>
          {!matches.length && <p role="status" className="px-4 py-5 text-sm text-slate-400">현재 조건에 맞는 게시물이 없습니다.</p>}
          <button type="submit" onMouseDown={event => event.preventDefault()} className="flex min-h-11 w-full items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-sky-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-200">전체 검색결과 보기<span aria-hidden="true">→</span></button>
        </div>}
      </div>
      <div className="col-span-2 w-40 sm:w-44">
        <FilterSelect name="category" label="분류" value={category} disabled={isPending}
          options={[{ value: "", label: "전체 분류" }, ...categories.map(value => ({ value, label: value }))]}
          onChange={next => navigate(contentListHref(kind, { q: value, category: next }))} />
      </div>
    </div>
    {activeFilters.length > 0 && <div aria-label="적용한 검색 조건" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      {activeFilters.map(({ key, value }) => <Link key={key} prefetch={false} scroll={false} href={contentListHref(kind, { q: query, category, [key]: undefined })} aria-label={`${value} 조건 해제`}
        className="inline-flex min-h-9 max-w-full items-center gap-2 text-xs text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-sky-200"><span className="truncate">{key === "q" ? `검색: ${value}` : value}</span><X size={12} aria-hidden="true" className="shrink-0 text-slate-500" /></Link>)}
      <Link prefetch={false} scroll={false} href={contentListHref(kind, {})} className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-sky-200"><RotateCcw size={12} aria-hidden="true" />초기화</Link>
    </div>}
  </Form>
}
