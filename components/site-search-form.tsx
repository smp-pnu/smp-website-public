"use client"

import Link from "next/link"
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { siteSearchMatches, type SiteSearchEntry } from "@/lib/site-search-query"

type SearchIndex = { entries: SiteSearchEntry[]; partial: boolean }
let cached: { value: SearchIndex; until: number } | undefined
let pending: Promise<SearchIndex> | undefined
function loadIndex() {
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.value)
  if (pending) return pending
  pending = fetch("/api/search", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000) })
    .then(async response => {
      if (!response.ok) throw new Error("Search unavailable")
      const value: SearchIndex = await response.json()
      if (!value.partial) cached = { value, until: Date.now() + 60_000 }
      return value
    }).finally(() => { pending = undefined })
  return pending
}

export function SiteSearchForm({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter()
  const id = useId()
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(-1)
  const [isNavigating, startNavigation] = useTransition()
  const navigationStarted = useRef(false)
  useEffect(() => {
    if (navigationStarted.current && !isNavigating) {
      navigationStarted.current = false
      onNavigate()
    }
  }, [isNavigating, onNavigate])
  function navigate(href: string) {
    if (isNavigating) return
    navigationStarted.current = true
    startNavigation(() => router.push(href))
  }
  useEffect(() => {
    let mounted = true
    void loadIndex().then(value => { if (mounted) setIndex(value) }, () => { if (mounted) setFailed(true) })
    return () => { mounted = false }
  }, [])
  const matches = useMemo(() => siteSearchMatches(index?.entries ?? [], query, 6), [index, query])
  // The panel has its own close control. Keep links mounted through input blur
  // so touch/Safari clicks are not lost before their navigation event fires.
  const expanded = !!query.trim()
  const resultsHref = `/search?q=${encodeURIComponent(query.trim())}`
  return <form action="/search" role="search" aria-busy={isNavigating} className="mx-auto max-w-3xl"
    onSubmit={event => { event.preventDefault(); if (query.trim()) navigate(resultsHref) }}>
    <div className="flex gap-3">
      <label htmlFor={`${id}-query`} className="sr-only">사이트 검색</label>
      <input autoFocus id={`${id}-query`} name="q" type="search" required maxLength={100}
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`}
        aria-activedescendant={expanded && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off" value={query} readOnly={isNavigating} placeholder="리포트, 공지, 이름, 학과 검색"
        onChange={event => { setQuery(event.target.value); setActive(-1) }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
          if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setActive(value => (value + 1) % matches.length) }
          if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setActive(value => (value <= 0 ? matches.length : value) - 1) }
          if (event.key === "Enter" && expanded && active >= 0 && matches[active]) {
            event.preventDefault(); navigate(matches[active].href)
          }
        }} className="min-w-0 flex-1 border-b border-white/40 bg-transparent px-2 py-3 text-white outline-none focus:border-sky-300" />
      <button className="px-4 text-sm text-sky-300 disabled:cursor-wait" type="submit" disabled={isNavigating}>{isNavigating ? "검색 중…" : "검색"}</button>
    </div>
    <div id={`${id}-results`} role="listbox" aria-label="검색결과 미리보기" hidden={!expanded}
      className="mt-3 max-h-[55svh] overflow-y-auto divide-y divide-white/10 rounded-lg border border-white/15 bg-[#0c1727]">
      {matches.map((item, i) => <Link key={`${item.href}-${i}`} href={item.href} prefetch={false}
        id={`${id}-option-${i}`} role="option" aria-selected={active === i}
        onNavigate={event => { event.preventDefault(); navigate(item.href) }}
        onMouseEnter={() => setActive(i)}
        className={`block px-4 py-3 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300 ${active === i ? "bg-white/10" : ""}`}>
        <span className="mb-1 block text-xs text-sky-300">{item.label}</span>
        <span className="block truncate text-sm text-white sm:text-base">{item.title}</span>
        <span className="mt-1 block truncate text-xs text-slate-400">{item.text}</span>
      </Link>)}
    </div>
    {expanded && <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
      <span>{isNavigating ? "검색결과를 여는 중입니다…" : failed || index?.partial ? "일부 미리보기를 불러오지 못했습니다. 전체 검색을 이용해주세요." : !index ? "검색 목록을 불러오는 중입니다…" : !matches.length ? "일치하는 결과가 없습니다." : "↑ ↓ 선택 · Enter 이동"}</span>
      <Link href={resultsHref} prefetch={false} aria-disabled={isNavigating}
        onNavigate={event => { event.preventDefault(); navigate(resultsHref) }} className="py-1 text-sky-300 hover:underline">전체 검색결과 보기 →</Link>
    </div>}
  </form>
}
