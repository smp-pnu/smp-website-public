import { Suspense } from "react"
import { PdfViewer } from "./pdf-viewer"
import type { ContentItem } from "@/lib/content-model"
import { getPdfSources, isTrustedAttachmentUrl } from "@/lib/pdf-source"
import { savedReportCover } from "@/lib/saved-cover-reader"
import { driveCoverUrl } from "@/lib/report-cover"

// Only called after ContentDetail verifies current publication. Body retrieval
// and preview metadata resolve independently, so neither hides the download link.
export function ContentAttachments({ item }: { item: ContentItem }) {
  if (!item.attachments.length && !item.externalUrl) return null
  const { kind } = item
  const pdfs = getPdfSources(item)
  const hasPreview = kind === "research" && !!driveCoverUrl(item)
  return <section aria-label="첨부 자료" className={kind === "research" ? "" : "border-t border-white/20 pt-7"}>
    <h2 className={kind === "research" ? "sr-only" : "text-lg text-white"}>첨부 자료</h2>
    {pdfs.map((file, index) => {
      const url = `/api/content/${kind}/${item.id}/pdf?${file.query}`
      return <div key={file.query} className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="min-w-0 break-words text-sm text-slate-200">{file.name}</h3>
          <a href={`${url}&download=1`} download className="shrink-0 rounded-md bg-sky-300 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-200">PDF 다운로드 ↓</a>
        </div>
        {index === 0 && hasPreview ? <Suspense fallback={<div role="status" className="aspect-[595/842] rounded-lg bg-white/5 p-6 text-sm text-slate-400">PDF 미리보기를 불러오는 중입니다.</div>}>
          <ReportPdfViewer item={item} url={url} />
        </Suspense> : <PdfViewer url={url} />}
      </div>
    })}
    <ul className="mt-4 space-y-3">
      {item.attachments.map((file, index) => {
        if (pdfs.some(pdf => pdf.query === `index=${index}`)) return null
        return <li key={`${file.name}-${index}`}>
          <a href={isTrustedAttachmentUrl(file.url) ? `/api/content/${kind}/${item.id}/file?index=${index}` : file.url} target="_blank" rel="noopener noreferrer"
            className="break-words text-sky-300 underline underline-offset-4">{file.name}{!isTrustedAttachmentUrl(file.url) && ` · ${new URL(file.url).hostname}`} ↗</a>
        </li>
      })}
      {item.externalUrl && !pdfs.some(pdf => pdf.query === "source=external") && <li>
        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-4">관련 링크 열기 · {new URL(item.externalUrl).hostname} ↗</a>
      </li>}
    </ul>
  </section>
}

async function ReportPdfViewer({ item, url }: { item: ContentItem; url: string }) {
  const cover = await savedReportCover(item)
  const fallbackUrl = `/api/content/research/${item.id}/cover?size=reader`
  const preview = {
    url: cover?.preview?.url ?? fallbackUrl,
    fallbackUrl: cover?.preview ? fallbackUrl : undefined,
    width: cover?.preview?.width ?? cover?.width ?? 595,
    height: cover?.preview?.height ?? cover?.height ?? 842,
    title: item.title,
  }
  return <PdfViewer url={url} preview={preview} />
}
