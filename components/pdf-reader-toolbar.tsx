"use client"

import { useEffect, useState } from 'react'

export const pdfButtonClass = 'rounded border border-white/25 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-sky-300'

export function PdfReaderToolbar({page,pages,zoom,disabled=false,onNavigate,onZoom,fullscreen,fullscreenAvailable,onFullscreen}: {
  page:number; pages:number; zoom:number; disabled?:boolean
  onNavigate:(page:number)=>void; onZoom:(zoom:number)=>void
  fullscreen:boolean; fullscreenAvailable:boolean; onFullscreen:()=>void
}) {
  const [draft,setDraft]=useState(String(page))
  useEffect(()=>setDraft(String(page)),[page])
  const commit=()=>{
    const value=Number(draft)
    if(draft.trim() && Number.isSafeInteger(value)){const next=Math.max(1,Math.min(pages,value));setDraft(String(next));onNavigate(next)}
    else setDraft(String(page))
  }
  return <div role="group" aria-label="PDF 페이지와 확대 설정" className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 p-3">
    <div className="flex items-center gap-2">
      <button aria-label="이전 페이지" className={pdfButtonClass} disabled={disabled || page<=1 || !pages} onClick={()=>onNavigate(page-1)}>←</button>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <span className="sr-only">PDF 페이지</span>
        <input aria-label="PDF 페이지" type="number" min={1} max={pages||1} value={draft} disabled={disabled || !pages}
          onChange={event=>setDraft(event.currentTarget.value)} onBlur={commit}
          onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}else if(event.key==='Escape')setDraft(String(page))}}
          className="w-14 rounded border border-white/25 bg-slate-900 p-2 text-center text-white" />
        <span aria-live="polite">/ {pages||'…'}</span>
      </label>
      <button aria-label="다음 페이지" className={pdfButtonClass} disabled={disabled || !pages || page>=pages} onClick={()=>onNavigate(page+1)}>→</button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-200">확대
        <select aria-label="PDF 확대" value={zoom} onChange={event=>onZoom(Number(event.target.value))} className="rounded border border-white/25 bg-slate-900 p-2 text-white">
          <option value={1}>화면에 맞춤</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option>
        </select>
      </label>
      {fullscreenAvailable && <button type="button" aria-pressed={fullscreen} className={pdfButtonClass} onClick={onFullscreen}>{fullscreen?'전체 화면 닫기':'전체 화면'}</button>}
    </div>
  </div>
}
