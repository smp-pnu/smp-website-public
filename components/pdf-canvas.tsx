"use client"

import { useCallback, useEffect, useState } from "react"
import { Document } from "react-pdf"
import type { RenderablePdfDocument } from "@/lib/pdf-reading-preload"
import { PdfBufferedPages } from "./pdf-buffered-pages"
import { usePdfReadingPreload } from "./use-pdf-reading-preload"
import { pdfOptions, preparedPdfOptions } from "./pdf-config"
import { preparedRangeFile } from "./pdf-range-file"
import type { ReaderTransport } from "@/lib/report-reader"
import { PdfReaderToolbar, pdfButtonClass as buttonClass } from "./pdf-reader-toolbar"
import { usePdfViewport } from "./use-pdf-viewport"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

export default function PdfCanvas({ url, rangeOnly, transport, page, onPageChange, onReady, onRetry, initialZoom=1, onUnavailable }: { url?: string; rangeOnly?:boolean; transport?:ReaderTransport; page:number; onPageChange:(page:number)=>void; onReady: (page:number) => void; onRetry: () => void; initialZoom?:number; onUnavailable?:()=>void }) {
  const {reader,viewport,width,fullscreen,fullscreenAvailable,fullscreenError,toggleFullscreen}=usePdfViewport()
  const [pages, setPages] = useState(0)
  const [zoom, setZoom] = useState(initialZoom)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [pdfDocument, setPdfDocument] = useState<RenderablePdfDocument>()
  const [initialPagesReady, setInitialPagesReady] = useState(false)
  const [rangeFile,setRangeFile]=useState<ReturnType<typeof preparedRangeFile>['file']>()
  const [rangeFallback,setRangeFallback]=useState(false)
  const preloadState = usePdfReadingPreload(pdfDocument, initialPagesReady, Boolean(transport && !rangeFallback))
  const fullyLoaded = preloadState === 'complete'
  useEffect(()=>{
    setRangeFallback(false);setRangeFile(undefined)
    setPdfDocument(undefined);setInitialPagesReady(false)
    if(!url || !transport)return
    const prepared=preparedRangeFile(url,transport,()=>setRangeFallback(true))
    setRangeFile(prepared.file)
    return prepared.dispose
  },[url,transport,attempt])
  const file=transport && !rangeFallback?rangeFile:url
  const [resumePage, setResumePage] = useState<number | null>(null)
  const fail = useCallback(() => { setFailed(true); if(onUnavailable)onUnavailable();else onReady(page) }, [onReady,page,onUnavailable])
  const preparedInitialPages = useCallback(() => setInitialPagesReady(true), [])
  // A reader jumping ahead or zooming should not wait for the initial window.
  const rendered = useCallback((value: number) => { if(value >= 3 || zoom !== 1) setInitialPagesReady(true); onReady(value) }, [onReady, zoom])

  function navigate(value: number) {
    const nextPage = Math.max(1, Math.min(pages, value))
    onPageChange(nextPage)
    setResumePage(null)
    try { localStorage.setItem(`smp:pdf-page:v1:${url}`, String(nextPage)) } catch { /* Reading also works with storage disabled. */ }
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }

  const error = <div role="alert" className="p-6 text-sm leading-7 text-slate-200">
    <p>PDF를 표시하지 못했습니다. 잠시 후 다시 시도하거나 위의 PDF 다운로드를 이용해주세요.</p>
    <p>계속 열리지 않으면 학회에 문의해주세요.</p>
    <button className={`${buttonClass} mt-3`} onClick={() => { onRetry(); setFailed(false); setPages(0); setInitialPagesReady(false); setPdfDocument(undefined); onPageChange(1); setAttempt(value => value + 1) }}>다시 시도</button>
  </div>

  return <div ref={reader} data-pdf-reader-mode="original" data-pdf-download-state={fullyLoaded ? 'complete' : 'partial'} className={`overflow-hidden rounded-lg border border-white/20 bg-slate-950 ${fullscreen ? "flex h-screen flex-col" : ""}`}>
    <PdfReaderToolbar page={page} pages={pages} zoom={zoom} disabled={failed} onNavigate={navigate} onZoom={setZoom}
      fullscreen={fullscreen} fullscreenAvailable={fullscreenAvailable} onFullscreen={toggleFullscreen} />
    {fullscreenError && <p role="status" className="px-4 py-2 text-xs text-slate-300">이 브라우저에서는 전체 화면을 열 수 없습니다.</p>}
    {resumePage && <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-2 text-xs text-slate-300">
      <button type="button" className="min-h-9 text-sky-200 hover:underline" onClick={() => navigate(resumePage)}>이전에 읽던 {resumePage}페이지부터 이어 읽기 →</button>
      <button type="button" className="min-h-9 px-2 text-slate-400" onClick={() => setResumePage(null)}>닫기</button>
    </div>}
    <div ref={viewport} tabIndex={0} aria-label="PDF 문서" className={`overflow-x-auto bg-slate-800 ${fullscreen ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
      {failed ? error : url && file && width > 0 && <Document key={`${attempt}:${rangeFallback}`} file={file} options={rangeOnly ? preparedPdfOptions : pdfOptions} suspense={false}
        loading={<p role="status" className="p-6 text-sm text-slate-200">PDF를 불러오고 있습니다…</p>}
        error={error} onLoadError={()=>{if(transport&&!rangeFallback)setRangeFallback(true);else fail()}} onSourceError={fail} onLoadSuccess={pdf => {
          setPages(pdf.numPages)
          setPdfDocument(pdf)
          if(page>pdf.numPages)onPageChange(pdf.numPages)
          try {
            const saved = Number(localStorage.getItem(`smp:pdf-page:v1:${url}`))
            if (Number.isInteger(saved) && saved > 1 && saved <= pdf.numPages) setResumePage(saved)
          } catch { /* Optional preference only. */ }
        }}
        onPassword={fail} externalLinkTarget="_blank" onItemClick={({ pageNumber }) => { if (pageNumber) navigate(pageNumber) }}>
        {pdfDocument && <PdfBufferedPages pdf={pdfDocument} page={page} width={width} zoom={zoom} prepareRemaining={fullyLoaded || preloadState === 'loading'} onDemand={preloadState === 'on-demand'} onReady={rendered} onInitialPagesReady={preparedInitialPages} onError={fail} />}
      </Document>}
    </div>
  </div>
}
