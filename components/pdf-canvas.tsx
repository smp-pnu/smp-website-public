"use client"

import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`
const options = {
  cMapUrl: `/pdfjs/${pdfjs.version}/cmaps/`,
  standardFontDataUrl: `/pdfjs/${pdfjs.version}/standard_fonts/`,
  wasmUrl: `/pdfjs/${pdfjs.version}/wasm/`,
  isEvalSupported: false,
  disableRange: true,
}
const buttonClass = "rounded border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-300"

export default function PdfCanvas({ url }: { url: string }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function navigate(value: number) {
    setPage(Math.max(1, Math.min(pages, value)))
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }

  const error = <div role="alert" className="p-6 text-sm leading-7 text-slate-200">
    <p>PDF를 표시하지 못했습니다. 잠시 후 다시 시도하거나 위의 PDF 다운로드를 이용해주세요.</p>
    <p>계속 열리지 않으면 학회에 문의해주세요.</p>
    <button className={`${buttonClass} mt-3`} onClick={() => { setFailed(false); setPages(0); setPage(1); setAttempt(value => value + 1) }}>다시 시도</button>
  </div>

  return <div className="overflow-hidden rounded-lg border border-white/20 bg-slate-950/80">
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
      <label className="flex items-center gap-2 text-sm text-slate-200">확대
        <select aria-label="PDF 확대" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="rounded border border-white/25 bg-slate-900 p-2 text-white">
          <option value={1}>화면에 맞춤</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option>
        </select>
      </label>
    </div>
    <div ref={viewport} tabIndex={0} aria-label="PDF 문서" className="max-h-[80svh] min-h-72 overflow-auto overscroll-contain bg-slate-800">
      {width > 0 && <Document key={attempt} file={url} options={options} suspense={false}
        loading={failed ? error : <p role="status" className="p-6 text-sm text-slate-200">PDF를 불러오고 있습니다…</p>}
        error={error} onLoadError={() => setFailed(true)} onLoadSuccess={pdf => { setPages(pdf.numPages); setFailed(false) }}
        onPassword={() => setFailed(true)} externalLinkTarget="_blank" onItemClick={({ pageNumber }) => { if (pageNumber) navigate(pageNumber) }}>
        {failed ? error : <Page pageNumber={page} width={width} scale={zoom} devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
          loading={<p role="status" className="p-6 text-slate-200">페이지를 표시하고 있습니다…</p>} error={error} />}
      </Document>}
    </div>
  </div>
}
