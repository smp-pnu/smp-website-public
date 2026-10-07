import type { Metadata } from "next"
import Link from "next/link"
import Form from "next/form"
import { Suspense } from "react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { getSiteSearchIndex } from "@/lib/site-search"
import { siteSearchMatches } from "@/lib/site-search-query"
export const metadata: Metadata = { title: "SEARCH | SMP" }
export const dynamic = "force-dynamic"

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const raw = (await searchParams).q
  const query = typeof raw === "string" ? raw.trim().slice(0, 100) : ""
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-4xl px-6 py-20">
    <h1 className="text-4xl font-light text-white">SEARCH</h1>
    <Form action="/search" prefetch={false} role="search" className="mt-10 flex gap-3">
      <label htmlFor="search-query" className="sr-only">검색어</label>
      <input key={query} id="search-query" name="q" type="search" maxLength={100} defaultValue={query} placeholder="리포트, 공지, 이름, 학과 검색" className="min-w-0 flex-1 border-b border-white/40 bg-black/25 px-4 py-3 text-white focus:outline-sky-300" />
      <button type="submit" className="px-4 text-sky-300">검색</button>
    </Form>
    {query ? <Suspense key={query} fallback={<p role="status" className="mt-8 text-sm text-slate-300">“{query}” 검색결과를 불러오는 중입니다…</p>}>
      <SearchResults query={query} />
    </Suspense> : <p className="mt-8 text-sm text-slate-300">검색어를 입력해주세요.</p>}
  </main><SiteFooter /></>
}

async function SearchResults({ query }: { query: string }) {
  const index = await getSiteSearchIndex()
  const results = siteSearchMatches(index.entries, query)
  return <>
    <p className="mt-8 text-sm text-slate-300">{`“${query}” 검색 결과 ${results.length}건`}</p>
    {index.partial && <p role="status" className="mt-3 text-sm text-slate-300">공지·리포트 검색 결과 일부를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>}
    {query && !results.length && <p className="mt-8 text-slate-300">검색 결과가 없습니다. 다른 검색어로 검색해보세요.</p>}
    <ul className="mt-8 divide-y divide-white/20">{results.map((item, index) => <li key={`${item.href}-${index}`} className="py-6"><Link prefetch={false} href={item.href} className="block rounded-sm focus-visible:outline-2 focus-visible:outline-sky-300"><h2 className="text-xl font-normal text-white hover:text-sky-300">{item.title}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{item.text}</p></Link></li>)}</ul>
  </>
}
