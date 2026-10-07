import type { Metadata } from "next"
import Link from "next/link"
import Form from "next/form"
import { Suspense } from "react"
import { ArrowRight, Search } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SearchField } from "@/components/search-field"
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
  const index = await getSiteSearchIndex()
  const results = siteSearchMatches(index.entries, query)
  return <>
    <p className="mt-8 break-words text-sm leading-6 text-slate-300">{`“${query}” 검색 결과 ${results.length}건`}</p>
    {index.partial && <p role="status" className="mt-3 text-sm text-slate-300">검색 결과 일부를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>}
    {!results.length ? <div className="mt-5 border-y border-white/15 bg-[#050c18]/60 px-6 py-14 text-center">
      <p className="text-base text-white">일치하는 검색 결과가 없습니다.</p>
      <p className="mt-2 text-sm leading-7 text-slate-400">철자를 확인하거나 더 짧은 검색어로 다시 검색해보세요.</p>
    </div> : <ul className="mt-5 divide-y divide-white/10 border-y border-white/15 bg-[#050c18]/60">
      {results.map((item, index) => <li key={`${item.href}-${index}`}>
        <Link prefetch={false} href={item.href} className="group flex items-start gap-4 px-5 py-6 transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-300 sm:gap-6 sm:px-7 sm:py-7">
          <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-6">
            <span className="inline-block min-w-12 shrink-0 rounded-[2px] border border-sky-200/15 bg-sky-200/[0.04] px-2 py-1 text-center text-[11px] leading-4 text-sky-200/80 sm:mt-0.5">{item.label}</span>
            <div className="mt-3 min-w-0 sm:mt-0">
              <h2 className="break-words text-base font-normal leading-7 text-white transition-colors group-hover:text-sky-200 sm:text-lg">{item.title}</h2>
              <p className="mt-2 line-clamp-2 break-words text-xs leading-6 text-slate-400 sm:text-sm">{item.text}</p>
            </div>
          </div>
          <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-sky-200" strokeWidth={1.5} />
        </Link>
      </li>)}
    </ul>}
  </>
}
