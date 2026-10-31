import { Suspense } from "react"
import { getContent } from "@/lib/content-catalog"
import { latestResearchEdition } from "@/lib/latest-research"
import { savedReportCover } from "@/lib/saved-cover-reader"
import { ResearchShowcase } from "@/components/research-showcase"

export function LatestResearchSection() {
  return <Suspense fallback={<ResearchShowcase items={[]} pending />}><LatestReports /></Suspense>
}

async function LatestReports() {
  const result = await getContent("research")
  const items = await Promise.all(latestResearchEdition(result.items).map(async item => {
    const cover = await savedReportCover(item)
    return { ...item, cover: cover ? { url: cover.url } : undefined }
  }))
  return <ResearchShowcase items={items} error={result.state === "error" ? "리포트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." : undefined} />
}
