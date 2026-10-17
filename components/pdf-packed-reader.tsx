"use client"

import { useEffect, useEffectEvent, useState } from 'react'
import { createPagePackLoader } from '@/lib/pdf-page-pack-loader'
import type { ReaderPreview } from '@/lib/report-reader'
import type { PreparedPdfPage } from '@/lib/pdf-page-cache'
import { PdfPageImages } from './pdf-page-images'
import { PdfReaderToolbar, pdfButtonClass } from './pdf-reader-toolbar'
import { usePdfViewport } from './use-pdf-viewport'

// The reading path does not import PDF.js, parse the PDF, or download its bytes.
// Original text/links remain available through the explicit original-mode action.
export default function PdfPackedReader({url,preview,page,onPageChange,onReady,onFallback,onOriginal,pendingOriginal}: {
  url:string;preview:ReaderPreview;page:number;onPageChange:(page:number)=>void;onReady:(page:number)=>void
  onFallback:()=>void;onOriginal:(zoom:number)=>void;pendingOriginal:boolean
}) {
  const {reader,viewport,width,fullscreen,fullscreenAvailable,fullscreenError,toggleFullscreen}=usePdfViewport()
  const [entries,setEntries]=useState<PreparedPdfPage[]>([]),[zoom,setZoom]=useState(1)
  const [resume,setResume]=useState<number|null>(null)
  const fallback=useEffectEvent(onFallback)
  const key=preview.pack!.key,bytes=preview.pack!.bytes,count=preview.pageCount
  const source=preview.packSource??preview.transport!.key
  useEffect(()=>{
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection
    if(connection?.saveData || ['slow-2g','2g'].includes(connection?.effectiveType??'')){fallback();return}
    const loader=createPagePackLoader(url,source,{key,bytes},count),abort=new AbortController()
    let owned:PreparedPdfPage[]=[]
    setEntries([])
    void loader.readAll(abort.signal).then(value=>{
      if(abort.signal.aborted){value?.forEach(entry=>URL.revokeObjectURL(entry.url));return}
      if(!value){fallback();return}
      owned=value;setEntries(value)
    }).catch(()=>{if(!abort.signal.aborted)fallback()})
    return ()=>{abort.abort();loader.dispose();owned.forEach(entry=>URL.revokeObjectURL(entry.url))}
  },[url,source,key,bytes,count])
  useEffect(()=>{
    try {const saved=Number(localStorage.getItem(`smp:pdf-page:v1:${url}`));if(Number.isInteger(saved)&&saved>1&&saved<=count)setResume(saved)}catch{}
  },[url,count])
  const navigate=(value:number)=>{
    const next=Math.max(1,Math.min(count,value));onPageChange(next);setResume(null)
    try {localStorage.setItem(`smp:pdf-page:v1:${url}`,String(next))}catch{}
    viewport.current?.scrollTo({top:0,left:0})
  }
  return <div ref={reader} data-pdf-reader-mode="prepared" className={`overflow-hidden rounded-lg border border-white/20 bg-slate-950 ${fullscreen?'flex h-screen flex-col':''}`}>
    <PdfReaderToolbar page={page} pages={count} zoom={zoom} onNavigate={navigate} onZoom={setZoom}
      fullscreen={fullscreen} fullscreenAvailable={fullscreenAvailable} onFullscreen={toggleFullscreen}
      action={<button className={pdfButtonClass} disabled={pendingOriginal} onClick={()=>onOriginal(zoom)} title="PDF 원문의 텍스트 선택과 링크를 사용합니다">{pendingOriginal?'원문 준비 중…':'텍스트 선택'}</button>} />
    {fullscreenError && <p role="status" className="px-4 py-2 text-xs text-slate-300">이 브라우저에서는 전체 화면을 열 수 없습니다.</p>}
    {resume && <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-2 text-xs text-slate-300">
      <button className="min-h-9 text-sky-200 hover:underline" onClick={()=>navigate(resume)}>이전에 읽던 {resume}페이지부터 이어 읽기 →</button>
      <button className="min-h-9 px-2 text-slate-400" onClick={()=>setResume(null)}>닫기</button>
    </div>}
    <div ref={viewport} tabIndex={0} aria-label="PDF 문서" className={`overflow-x-auto bg-slate-800 ${fullscreen?'min-h-0 flex-1 overflow-y-auto':''}`}>
      {width>0 && <PdfPageImages state={{entries,complete:entries.length===count,limited:false,failed:[]}} identity={key} page={page} width={width} zoom={zoom} onReady={onReady} onError={onFallback} />}
    </div>
  </div>
}
