"use client"

import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`
const options = {
  cMapUrl: `/pdfjs/${pdfjs.version}/cmaps/`,
  standardFontDataUrl: `/pdfjs/${pdfjs.version}/standard_fonts/`,
  wasmUrl: `/pdfjs/${pdfjs.version}/wasm/`,
  isEvalSupported: false,
  disableRange: true,
}

// Notion uploads have no thumbnail endpoint; render only their first page.
// This component is loaded only as a cover approaches the viewport.
export default function PdfCoverCanvas({ url, title }: { url: string; title: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pageRatio, setPageRatio] = useState(297 / 210)
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={container} role="img" aria-label={`${title} PDF 첫 페이지`} className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
    {width > 0 && !locked && <Document file={url} options={options} suspense={false} loading={null} error={null} onPassword={() => setLocked(true)}>
      <Page pageNumber={1} width={Math.min(width, width * (297 / 210) / pageRatio)} renderTextLayer={false} renderAnnotationLayer={false} devicePixelRatio={1.5} loading={null} error={null}
        onLoadSuccess={page => { const size = page.getViewport({ scale: 1 }); setPageRatio(size.height / size.width) }} />
    </Document>}
  </div>
}
