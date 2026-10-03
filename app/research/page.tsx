import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ContentList, type ContentSearch } from "@/components/content-list"
import { getContent } from "@/lib/notion"

export const metadata: Metadata = { title: "RESEARCH | SMP" }

export const dynamic = "force-dynamic"
export default async function ResearchPage({ searchParams }: { searchParams: Promise<ContentSearch> }) {
  const [result, search] = await Promise.all([getContent("research"), searchParams])
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-6xl px-6 py-20">
    <h1 className="text-center text-4xl font-light tracking-wide text-white sm:text-5xl">RESEARCH</h1>
    <p className="mt-5 text-center leading-7 text-slate-300">산업과 기업을 분석한 SMP의 투자 리포트입니다.</p>
    <ContentList result={result} kind="research" search={search} />
  </main><SiteFooter /></>
}
