import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ContentList, type ContentSearch } from "@/components/content-list"
import { getContent } from "@/lib/notion"
export const metadata: Metadata = { title: "NOTICE | SMP" }
export const dynamic = "force-dynamic"
export default async function NoticePage({ searchParams }: { searchParams: Promise<ContentSearch> }) {
  const [result, search] = await Promise.all([getContent("notice"), searchParams])
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-6xl px-6 py-20">
    <h1 className="text-center text-4xl font-light tracking-wide text-white sm:text-5xl">NOTICE</h1>
    <p className="mt-5 text-center text-slate-300">SMP의 새로운 소식과 주요 일정을 안내합니다.</p>
    <ContentList result={result} kind="notice" search={search} />
  </main><SiteFooter /></>
}
