"use client"

import { useId, useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Search } from "lucide-react"
import type { ContentKind } from "@/lib/content-model"

export type ContentSuggestion = {
  title: string
  summary: string
  author: string
  category: string
  href: string
}

export function ContentSearchForm({
  kind, query, category, categories, suggestions,
}: {
  kind: ContentKind
  query: string
  category: string
  categories: string[]
  suggestions: ContentSuggestion[]
}) {
  const router = useRouter()
  const id = useId()
  const listboxId = `${id}-suggestions`
  const [value, setValue] = useState(query)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const isResearch = kind === "research"
  const terms = value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches = terms.length
    ? suggestions.filter(item => {
      const text = `${item.title} ${item.summary} ${item.author} ${item.category}`.toLocaleLowerCase()
      return terms.every(term => text.includes(term))
    }).slice(0, 6)
    : []
  const showSuggestions = open && matches.length > 0

  function choose(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
    } else if (event.key === "Enter" && showSuggestions && activeIndex >= 0) {
      event.preventDefault()
      choose(matches[activeIndex].href)
    }
  }

  return <form action={`/${kind}`} role="search" className={`mt-12 flex flex-col gap-4 sm:flex-row ${isResearch ? "border-y border-white/15 py-4 sm:items-center" : ""}`}>
    <div className="relative min-w-0 flex-1" onFocus={() => setOpen(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
    }}>
      <label htmlFor={`${id}-query`} className="sr-only">{kind === "notice" ? "공지" : "리포트"} 검색</label>
      {isResearch && <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />}
      <input id={`${id}-query`} name="q" type="search" maxLength={100} autoComplete="off" value={value}
        role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls={listboxId}
        aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        onChange={event => { setValue(event.currentTarget.value); setActiveIndex(-1); setOpen(true) }} onKeyDown={onSearchKeyDown}
        placeholder="제목, 내용, 작성자 검색" className={`w-full text-white placeholder:text-slate-400 focus:outline-sky-300 ${isResearch ? "bg-transparent py-2.5 pl-8 pr-3 text-sm" : "border-b border-white/30 bg-black/20 px-4 py-3"}`} />
      {showSuggestions && <ul id={listboxId} role="listbox" aria-label="검색 추천" className="absolute inset-x-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded border border-white/15 bg-[#0b1421] py-1 shadow-2xl">
        {matches.map((item, index) => <li id={`${listboxId}-option-${index}`} key={item.href} role="option" aria-selected={activeIndex === index}>
          <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item.href)}
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none">
            <span className="min-w-0"><span className="block truncate text-sm text-white">{item.title}</span><span className="mt-1 block truncate text-xs text-slate-400">{item.category}{item.author ? ` · ${item.author}` : ""}</span></span>
            <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
          </button>
        </li>)}
      </ul>}
    </div>
    <label><span className="sr-only">분류</span><select name="category" defaultValue={category} onChange={event => event.currentTarget.form?.requestSubmit()} className={`w-full sm:w-40 ${isResearch ? "min-h-11 bg-transparent px-3 py-2.5 text-sm text-slate-300 [color-scheme:dark] focus:outline-sky-300" : "h-full min-h-12 border-b border-white/30 bg-[#101b2d] px-4 py-3 text-white"}`}><option value="">전체 분류</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <button className={`inline-flex items-center justify-center gap-2 border text-sm ${isResearch ? "min-h-11 rounded-[2px] border-white/20 px-6 py-2.5 text-slate-200 transition-colors hover:border-white/40 hover:bg-white/5" : "border-sky-300/40 px-5 py-3 text-sky-200 hover:bg-sky-300/10"}`} type="submit">{!isResearch && <Search size={16} aria-hidden="true" />}검색</button>
  </form>
}
