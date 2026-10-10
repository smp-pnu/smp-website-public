import type { Metadata } from "next"
import { NoticeListing } from "@/components/notice-listing"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ContentList, type ContentSearch } from "@/components/content-list"
import { getContent } from "@/lib/content-catalog"
export const metadata: Metadata = { title: "NOTICE | SMP" }
export const dynamic = "force-dynamic"
export default async function NoticePage({ searchParams }: { searchParams: Promise<ContentSearch> }) {
  const [result, search] = await Promise.all([getContent("notice"), searchParams])
  return <><SiteHeader /><NoticeListing>
    <ContentList result={result} kind="notice" search={search} />
  </NoticeListing><SiteFooter /></>
}
