import type { Metadata } from "next"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ContentList, type ContentSearch } from "@/components/content-list"
import { getContent } from "@/lib/content-catalog"
export const metadata: Metadata = { title: "NOTICE | SMP" }
export const dynamic = "force-dynamic"
export default async function NoticePage({ searchParams }: { searchParams: Promise<ContentSearch> }) {
  const [result, search] = await Promise.all([getContent("notice"), searchParams])
  return <><SiteHeader /><main className="site-page min-h-[75svh] max-w-6xl">
    <PageIntro eyebrow="SMP NOTICE" title="NOTICE">SMP의 새로운 소식과 주요 일정을 안내합니다.</PageIntro>
    <ContentList result={result} kind="notice" search={search} />
  </main><SiteFooter /></>
}
