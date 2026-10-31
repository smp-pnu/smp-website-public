"use client"

import { useEffect, useState } from 'react'
import { PDF_ZOOM_LEVELS, pdfSpread, type PdfPagesPerView } from '@/lib/pdf-reader-layout'

export const pdfButtonClass = 'min-h-12 sm:min-h-10 rounded border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-300'

export function PdfReaderToolbar({page,pages,zoom,disabled=false,onNavigate,onZoom,fullscreen,fullscreenAvailable,onFullscreen,pagesPerView=1,onPagesPerView}: {
  page:number; pages:number; zoom:number; disabled?:boolean
  onNavigate:(page:number)=>void; onZoom:(zoom:number)=>void
  fullscreen:boolean; fullscreenAvailable:boolean; onFullscreen:()=>void
  pagesPerView?:PdfPagesPerView; onPagesPerView?:(count:PdfPagesPerView)=>void
}) {
  const spread=pdfSpread(page,pages,pagesPerView)
  const [draft,setDraft]=useState(String(spread.start))
  useEffect(()=>setDraft(String(spread.start)),[spread.start])
  const commit=()=>{
    const value=Number(draft)
    if(draft.trim() && Number.isSafeInteger(value)){const next=pdfSpread(value,pages,pagesPerView).start;setDraft(String(next));onNavigate(next)}
    else setDraft(String(spread.start))
  }
  return <div role="group" aria-label="PDF 페이지와 확대 설정" className="pdf-reader-toolbar flex flex-wrap items-center justify-between gap-4 border-b border-white/15 p-3">
    <div className="flex items-center gap-2">
      <button aria-label="이전 페이지" className={pdfButtonClass} disabled={disabled || spread.start<=1 || !pages} onClick={()=>onNavigate(spread.start-pagesPerView)}>←</button>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <span className="sr-only">PDF 페이지</span>
        <input aria-label="PDF 페이지" type="number" min={1} max={pages||1} step={pagesPerView} value={draft} disabled={disabled || !pages}
          onChange={event=>setDraft(event.currentTarget.value)} onBlur={commit}
          onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}else if(event.key==='Escape')setDraft(String(spread.start))}}
          className="w-14 rounded border border-white/25 bg-slate-900 p-2 text-center text-white" />
        <span aria-live="polite">{spread.end>spread.start?`– ${spread.end} `:''}/ {pages||'…'}</span>
      </label>
      <button aria-label="다음 페이지" className={pdfButtonClass} disabled={disabled || !pages || spread.end>=pages} onClick={()=>onNavigate(spread.end+1)}>→</button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {fullscreen && onPagesPerView && <div role="group" aria-label="PDF 페이지 배치" className="flex rounded border border-white/25 p-0.5">
        {([1,2] as const).map(count=><button key={count} type="button" aria-pressed={pagesPerView===count}
          disabled={disabled || !pages || (count===2 && pages<2)} onClick={()=>onPagesPerView(count)}
          className={`rounded px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-35 ${pagesPerView===count?'bg-white/15 text-white':'text-slate-300 hover:bg-white/10'}`}>
          {count===1?'한 페이지':'두 페이지'}
        </button>)}
      </div>}
      <label className="flex items-center gap-2 text-sm text-slate-200">배율
        <select aria-label="PDF 확대" value={zoom} onChange={event=>onZoom(Number(event.target.value))} className="rounded border border-white/25 bg-slate-900 p-2 text-white">
          {PDF_ZOOM_LEVELS.map(value=><option key={value} value={value}>{value===1?'100% · 너비 맞춤':`${value*100}%`}</option>)}
        </select>
      </label>
      {fullscreenAvailable && <button type="button" aria-pressed={fullscreen} className={pdfButtonClass} onClick={onFullscreen}>{fullscreen?'전체 화면 닫기':'전체 화면'}</button>}
    </div>
  </div>
}
