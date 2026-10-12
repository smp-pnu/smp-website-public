"use client"

import { useRef, useState } from "react"
import { PdfViewer, type PdfPreview } from "./pdf-viewer"
import { ReportAiSummary } from "./report-ai-summary"
import type { PublicReportAiSummary } from "@/lib/report-ai-summary"

export function ResearchPdf({ url, preview, summary }: { url: string; preview?: PdfPreview; summary?: PublicReportAiSummary | null }) {
  const viewer = useRef<HTMLDivElement>(null)
  const [pageRequest, setPageRequest] = useState<{ page: number; sequence: number }>()
  return <><div ref={viewer} className="scroll-mt-24" tabIndex={-1} aria-label="리포트 PDF 뷰어">
    <PdfViewer url={url} preview={preview} pageRequest={pageRequest} />
  </div>{summary && <ReportAiSummary summary={summary} onPage={page => {
    setPageRequest(previous => ({ page, sequence: (previous?.sequence ?? 0) + 1 }))
    viewer.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
    viewer.current?.focus({ preventScroll: true })
  }} />}</>
}
