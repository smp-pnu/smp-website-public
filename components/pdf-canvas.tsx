"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import { pdfOptions } from "./pdf-config"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

const buttonClass = "rounded border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-300"

export default function PdfCanvas({ url, onReady, onRetry }: { url: string; onReady: () => void; onRetry: () => void }) {
  const reader = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [resumePage, setResumePage] = useState<number | null>(null)
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)
  const fail = useCallback(() => { setFailed(true); onReady() }, [onReady])
  useEffect(() => {
    setFullscreenAvailable(Boolean(document.fullscreenEnabled))
    const update = () => setFullscreen(document.fullscreenElement === reader.current)
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [])
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function navigate(value: number) {
    const nextPage = Math.max(1, Math.min(pages, value))
    setPage(nextPage)
    setResumePage(null)
    try { localStorage.setItem(`smp:pdf-page:v1:${url}`, String(nextPage)) } catch { /* Reading also works with storage disabled. */ }
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }

  const error = <div role="alert" className="p-6 text-sm leading-7 text-slate-200">
    <p>PDF를 표시하지 못했습니다. 잠시 후 다시 시도하거나 위의 PDF 다운로드를 이용해주세요.</p>
    <p>계속 열리지 않으면 학회에 문의해주세요.</p>
    <button className={`${buttonClass} mt-3`} onClick={() => { onRetry(); setFailed(false); setPages(0); setPage(1); setAttempt(value => value + 1) }}>다시 시도</button>
  </div>

  return <div ref={reader} className={`overflow-hidden rounded-lg border border-white/20 bg-slate-950 ${fullscreen ? "flex h-screen flex-col" : ""}`}>
    <div role="group" aria-label="PDF 페이지와 확대 설정" className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 p-3">
      <div className="flex items-center gap-2">
        <button aria-label="이전 페이지" className={buttonClass} disabled={page <= 1 || failed || !pages} onClick={() => navigate(page - 1)}>←</button>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <span className="sr-only">PDF 페이지</span>
          <input aria-label="PDF 페이지" type="number" min={1} max={pages || 1} value={page} disabled={!pages || failed}
            onChange={event => { const value = event.currentTarget.valueAsNumber; if (Number.isInteger(value)) navigate(value) }}
            className="w-14 rounded border border-white/25 bg-slate-900 p-2 text-center text-white" />
          <span aria-live="polite">/ {pages || "…"}</span>
        </label>
        <button aria-label="다음 페이지" className={buttonClass} disabled={!pages || page >= pages || failed} onClick={() => navigate(page + 1)}>→</button>
      </div>
      <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm text-slate-200">확대
        <select aria-label="PDF 확대" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="rounded border border-white/25 bg-slate-900 p-2 text-white">
          <option value={1}>화면에 맞춤</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option>
        </select>
      </label>
      {fullscreenAvailable && <button type="button" aria-pressed={fullscreen} className={buttonClass} onClick={async () => {
        try {
          setFullscreenError(false)
          if (document.fullscreenElement === reader.current) await document.exitFullscreen()
          else await reader.current?.requestFullscreen()
        } catch { setFullscreenError(true) }
      }}>{fullscreen ? "전체 화면 닫기" : "전체 화면"}</button>}</div>
    </div>
    {fullscreenError && <p role="status" className="px-4 py-2 text-xs text-slate-300">이 브라우저에서는 전체 화면을 열 수 없습니다.</p>}
    {resumePage && <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-2 text-xs text-slate-300">
      <button type="button" className="min-h-9 text-sky-200 hover:underline" onClick={() => navigate(resumePage)}>이전에 읽던 {resumePage}페이지부터 이어 읽기 →</button>
      <button type="button" className="min-h-9 px-2 text-slate-400" onClick={() => setResumePage(null)}>닫기</button>
    </div>}
    <div ref={viewport} tabIndex={0} aria-label="PDF 문서" className={`overflow-x-auto bg-slate-800 ${fullscreen ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
      {failed ? error : width > 0 && <Document key={attempt} file={url} options={pdfOptions} suspense={false}
        loading={<p role="status" className="p-6 text-sm text-slate-200">PDF를 불러오고 있습니다…</p>}
        error={error} onLoadError={fail} onSourceError={fail} onLoadSuccess={pdf => {
          setPages(pdf.numPages)
          try {
            const saved = Number(localStorage.getItem(`smp:pdf-page:v1:${url}`))
            if (Number.isInteger(saved) && saved > 1 && saved <= pdf.numPages) setResumePage(saved)
          } catch { /* Optional preference only. */ }
        }}
        onPassword={fail} externalLinkTarget="_blank" onItemClick={({ pageNumber }) => { if (pageNumber) navigate(pageNumber) }}>
        <Page pageNumber={page} width={width} scale={zoom} devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
          onRenderSuccess={onReady} onLoadError={fail} onRenderError={fail}
          loading={<p role="status" className="p-6 text-slate-200">페이지를 표시하고 있습니다…</p>} error={error} />
      </Document>}
    </div>
  </div>
}
