import type { Metadata } from "next"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ContentList, type ContentSearch } from "@/components/content-list"
import { getContent } from "@/lib/content-catalog"

export const metadata: Metadata = { title: "RESEARCH | SMP" }

export const dynamic = "force-dynamic"
export default async function ResearchPage({ searchParams }: { searchParams: Promise<ContentSearch> }) {
  const [result, search] = await Promise.all([getContent("research"), searchParams])
  return <><SiteHeader /><main className="site-page min-h-[75svh] max-w-6xl">
    <PageIntro eyebrow="SMP PUBLICATIONS" title="RESEARCH">산업과 기업을 분석한 SMP의 투자 리포트입니다.</PageIntro>
    <ContentList result={result} kind="research" search={search} />
  </main><SiteFooter /></>
}
