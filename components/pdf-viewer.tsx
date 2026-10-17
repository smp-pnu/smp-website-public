"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import { useCallback, useEffect, useState } from "react"
import type { ReaderPreview } from "@/lib/report-reader"

const PdfCanvas = dynamic(() => import("./pdf-canvas"), {
  ssr: false,
  loading: () => null,
})

const PdfPackedReader = dynamic(() => import("./pdf-packed-reader"), {ssr:false, loading:()=>null})

export type PdfPreview = { url: string; fallbackUrl?: string; width: number; height: number; title: string; reader?:ReaderPreview }

type PdfViewerProps = { url?: string; preview?: PdfPreview }
export function PdfViewer(props: PdfViewerProps) {
  return <PdfReader key={props.url} {...props} />
}

function PdfReader({ url, preview }: PdfViewerProps) {
  const canPack=Boolean(preview?.reader?.pack && (preview.reader.packSource || preview.reader.transport))
  const [packReady,setPackReady]=useState(false),[canvasReady,setCanvasReady]=useState(false)
  const [packFailed,setPackFailed]=useState(false),[originalRequested,setOriginalRequested]=useState(false)
  const [originalFailed,setOriginalFailed]=useState(false),[initialZoom,setInitialZoom]=useState(1)
  const ready=packReady || canvasReady
  const needOriginal=!canPack || packFailed || originalRequested
  const [page,setPage]=useState(1)
  const [failedImages,setFailedImages]=useState<string[]>([])
  useEffect(() => {
    if (!url) return
    for (const page of preview?.reader?.pages ?? []) {
      const image = new window.Image()
      image.decoding = 'async'
      image.fetchPriority = 'low'
      image.src = page.url
      void image.decode().catch(() => {})
    }
  }, [url, preview?.reader?.pages])
  const image=preview?.reader?.pages.find(p=>p.page===page)
  const imageUrl=image?.url??(page===1?preview?.url:undefined)
  const fallbackUrl=page===1?preview?.fallbackUrl:undefined
  const selectedUrl=imageUrl && !failedImages.includes(imageUrl)?imageUrl:fallbackUrl && !failedImages.includes(fallbackUrl)?fallbackUrl:undefined
  const showReader = useCallback((renderedPage:number) => { if(renderedPage===page)setCanvasReady(true) }, [page])
  const showPack = useCallback((renderedPage:number) => { if(renderedPage===page)setPackReady(true) }, [page])
  const showPreview = useCallback(() => setCanvasReady(false), [])
  const fallback = useCallback(()=>{setPackFailed(true);setPackReady(false)},[])
  const openOriginal = useCallback((zoom:number)=>{setInitialZoom(zoom);setOriginalFailed(false);setOriginalRequested(true)},[])
  const originalUnavailable = useCallback(()=>{setOriginalRequested(false);setOriginalFailed(true)},[])
  return <>
    <div className="relative">
      {!ready && <div className="overflow-hidden rounded-lg border border-white/20 bg-slate-950/80">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/15 px-4 py-2 text-xs text-slate-300">
          <div className="flex items-center gap-3" role="group" aria-label="저장된 페이지 미리보기">
            <button aria-label="미리보기 이전 페이지" disabled={page<=1} className="min-h-9 rounded border border-white/20 px-3 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-300" onClick={()=>setPage(p=>Math.max(1,p-1))}>←</button>
            <span>{page} / {preview?.reader?.pageCount??"…"}</span>
            <button aria-label="미리보기 다음 페이지" disabled={!preview?.reader || page>=preview.reader.pages.length} className="min-h-9 rounded border border-white/20 px-3 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-300" onClick={()=>setPage(p=>p+1)}>→</button>
          </div>
          <p role="status">{selectedUrl ? "미리보기 · 원문 준비 중" : "PDF를 불러오고 있습니다…"}</p>
        </div>
        <div className="relative bg-slate-800" style={{ aspectRatio: `${image?.width??preview?.width??595} / ${image?.height??preview?.height??842}` }}>
          {fallbackUrl && selectedUrl!==fallbackUrl && !failedImages.includes(fallbackUrl) && <Image src={fallbackUrl} alt="" aria-hidden="true" width={preview?.width??595} height={preview?.height??842} unoptimized loading="eager" className="absolute inset-0 h-full w-full object-contain" onError={()=>setFailedImages(v=>[...v,fallbackUrl])} />}
          {selectedUrl && preview && <Image key={selectedUrl} src={selectedUrl} alt={`${preview.title} ${page}페이지 미리보기`}
            width={image?.width??preview.width} height={image?.height??preview.height} unoptimized loading="eager" fetchPriority="high" decoding="async"
            className="relative h-auto w-full" onError={() => setFailedImages(v=>[...v,selectedUrl])} />}
        </div>
      </div>}
      {canPack && !packFailed && !canvasReady && url && preview?.reader && <div className={packReady?undefined:"pointer-events-none absolute inset-0 opacity-0"} inert={!packReady} aria-hidden={!packReady}>
        {originalFailed && <p role="status" className="px-4 py-2 text-xs text-slate-300">원문을 열지 못했습니다. 준비된 페이지는 계속 읽을 수 있습니다.</p>}
        <PdfPackedReader url={url} preview={preview.reader} page={page} onPageChange={setPage} onReady={showPack} onFallback={fallback} onOriginal={openOriginal} pendingOriginal={originalRequested} />
      </div>}
      {needOriginal && <div className={canvasReady ? undefined : "pointer-events-none absolute inset-0 opacity-0"} inert={!canvasReady} aria-hidden={!canvasReady}>
        <PdfCanvas url={url} rangeOnly={preview?.reader?.rangeOnly} transport={preview?.reader?.transport} page={page} onPageChange={setPage} onReady={showReader} onRetry={showPreview} initialZoom={initialZoom} onUnavailable={packReady?originalUnavailable:undefined} />
      </div>}
    </div>
    <noscript><p className="p-6 text-slate-300">PDF 미리보기를 사용하려면 JavaScript를 켜주세요. 위 다운로드 버튼으로도 파일을 받을 수 있습니다.</p></noscript>
  </>
}
