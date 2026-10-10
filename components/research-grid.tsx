import { Suspense } from "react"
import { ReportCover } from "./report-cover"
import { ResearchGridView } from "./research-grid-view"
import { savedReportCover } from "@/lib/saved-cover-reader"
import { getPdfSources } from "@/lib/pdf-source"
import type { ContentItem } from "@/lib/content-model"
import type { ContentSearch } from "@/lib/content-navigation"

export function ResearchGrid(props: { items: ContentItem[]; listSearch?: ContentSearch }) {
  return <ResearchGridView {...props} renderCover={(item, eager) => <Suspense fallback={<div className="aspect-[210/297] bg-slate-100" />}><SavedReportCover item={item} eager={eager} /></Suspense>} />
}

async function SavedReportCover({ item, eager }: { item: ContentItem; eager: boolean }) {
  const saved = await savedReportCover(item)
  const pdf = getPdfSources(item)[0]
  const isDrive = pdf && new URL(pdf.url).hostname === "drive.usercontent.google.com"
  const cover = {
    title: item.title,
    imageUrl: saved?.url ?? (isDrive ? `/api/content/research/${item.id}/cover` : undefined),
    fallbackUrl: saved ? `/api/content/research/${item.id}/cover` : undefined,
    pdfUrl: pdf && !isDrive ? `/api/content/research/${item.id}/pdf?${pdf.query}` : undefined,
  }
  return <ReportCover key={`${item.id}:${item.editedAt}:${saved?.url}`} {...cover} eager={eager} />
}
