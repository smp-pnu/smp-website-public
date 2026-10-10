import type { Metadata } from "next"
import Link from "next/link"
import Form from "next/form"
import { Suspense } from "react"
import { ArrowRight, Search } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SearchField } from "@/components/search-field"
import { SiteSearchResults } from "@/components/site-search-results"
import { getSiteSearchIndex } from "@/lib/site-search"
import { siteSearchMatches } from "@/lib/site-search-query"
export const metadata: Metadata = { title: "SEARCH | SMP" }
export const dynamic = "force-dynamic"

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const raw = (await searchParams).q
  const query = typeof raw === "string" ? raw.trim().slice(0, 100) : ""
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-5xl px-6 py-20 sm:py-24">
    <header className="text-center">
      <p className="text-[11px] tracking-[0.3em] text-sky-200/80">EXPLORE SMP</p>
      <h1 className="mt-4 text-4xl font-light tracking-wide text-white sm:text-5xl">SEARCH</h1>
      <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">SMP의 리포트와 소식, 사람들을 한곳에서 찾아보세요.</p>
    </header>
    <Form action="/search" prefetch={false} role="search" className="mt-10 sm:mt-12">
      <SearchField key={query} id="search-query" label="검색어" name="q" maxLength={100} defaultValue={query} placeholder="검색어를 입력하세요" />
    </Form>
    {query ? <Suspense key={query} fallback={<SearchResultsLoading query={query} />}>
      <SearchResults query={query} />
    </Suspense> : <div className="mt-8 border-y border-white/15 bg-[#050c18]/50 px-6 py-14 text-center">
      <Search aria-hidden="true" className="mx-auto h-6 w-6 text-sky-200/60" strokeWidth={1.5} />
      <p className="mt-5 text-base text-white">어떤 정보를 찾고 계신가요?</p>
      <p className="mt-2 text-sm leading-7 text-slate-400">기업명, 리포트 제목, 이름 또는 학과를 입력해보세요.</p>
    </div>}
  </main><SiteFooter /></>
}

function SearchResultsLoading({ query }: { query: string }) {
  return <div className="mt-8">
    <p role="status" className="break-words text-sm leading-6 text-slate-300">“{query}” 검색결과를 불러오는 중입니다…</p>
    <div aria-hidden="true" className="mt-5 divide-y divide-white/10 border-y border-white/15 bg-[#050c18]/60 px-5 sm:px-7">
      {[0, 1, 2].map(row => <div key={row} className="flex gap-5 py-7 motion-safe:animate-pulse">
        <div className="h-6 w-12 shrink-0 bg-white/10" />
        <div className="flex-1"><div className="h-5 w-2/3 bg-white/10" /><div className="mt-3 h-3 w-5/6 bg-white/[0.05]" /></div>
      </div>)}
    </div>
  </div>
}

async function SearchResults({ query }: { query: string }) {
  return <SiteSearchResults query={query} index={await getSiteSearchIndex()} />
}
