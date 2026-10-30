"use client"

import {useCallback,useEffect,useState,type ReactNode} from 'react'
import type {PdfPreparation,PreparedPdfPage} from '@/lib/pdf-page-cache'
import { PDF_PAGE_GAP, pdfPaperWidth, pdfSpread, type PdfPagesPerView } from '@/lib/pdf-reader-layout'

function CachedPageImage({ url, page, width, height, onDecoded, onError }: {
  url: string; page: number; width: number; height: number
  onDecoded: (url: string, ready: boolean) => void; onError: () => void
}) {
  useEffect(() => () => onDecoded(url, false), [url, onDecoded])
  // Decode before swapping, including when returning to a previously unmounted image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`PDF ${page}페이지`} width={width} height={height} draggable={false} className="block h-full w-full"
    onLoad={event => { const image = event.currentTarget; void image.decode().then(() => { if (image.isConnected) onDecoded(url, true) }).catch(() => { if (image.isConnected) onError() }) }} onError={onError} />
}

export function PdfPageImages({state,identity,page,pageCount,pagesPerView=1,width,zoom,onDemand=false,onReady,onError,overlay}: {
  state:PdfPreparation;identity:unknown;page:number;pageCount:number;pagesPerView?:PdfPagesPerView;width:number;zoom:number;onDemand?:boolean
  onReady:(page:number)=>void;onError:()=>void;overlay?:(entry:PreparedPdfPage)=>ReactNode
}) {
  const [visible, setVisible] = useState<{start:number;end:number} | null>(null)
  const [decoded, setDecoded] = useState<Set<string>>(() => new Set())
  useEffect(() => { setVisible(null); setDecoded(new Set()) }, [identity])
  const handleDecoded = useCallback((url: string, ready: boolean) => setDecoded(previous => {
    if (previous.has(url) === ready) return previous
    const next = new Set(previous)
    if (ready) next.add(url); else next.delete(url)
    return next
  }), [])
  const requested=pdfSpread(page,pageCount,pagesPerView)
  const requestedEntries=requested.pages.flatMap(number=>state.entries.filter(entry=>entry.page===number))
  const ready=requestedEntries.length===requested.pages.length && requestedEntries.length>0 && requestedEntries.every(entry=>decoded.has(entry.url))
  const shown=ready?requested:visible
  const shownEntries=shown?state.entries.filter(entry=>entry.page>=shown.start && entry.page<=shown.end).sort((a,b)=>a.page-b.page):[]
  const next=ready?state.entries.find(entry=>entry.page===requested.end+1):undefined
  // At most four decoded images during a spread transition. Retain the old
  // spread until BOTH new images decode; remaining pages stay compressed blobs.
  const mounted=[...new Set([...shownEntries,...requestedEntries,...(next?[next]:[])])]
  const {start,end}=requested
  useEffect(() => {
    if (ready) { setVisible(previous=>previous?.start===start && previous.end===end?previous:{start,end}); onReady(page) }
  }, [ready, page, start, end, onReady])
  const paperWidth=pdfPaperWidth(width,pagesPerView)*zoom
  const sheetWidth=paperWidth*pagesPerView+PDF_PAGE_GAP*(pagesPerView-1)
  const pending=!ready
  return <div data-pdf-prepared-pages={state.entries.length} data-pdf-cache-bytes={state.entries.reduce((sum, entry) => sum + entry.bytes, 0)} data-pdf-preparation={state.complete ? 'complete' : state.limited ? 'limited' : onDemand ? 'on-demand' : 'preparing'}>
    <p className="border-b border-white/10 px-4 py-2 text-xs text-slate-300" role="status">
      {state.complete ? '전체 페이지 준비 완료' : state.limited || state.failed.length || onDemand ? '준비된 페이지부터 읽을 수 있습니다' : `페이지 준비 중 · ${state.entries.length}`}
    </p>
    <div className="relative flex items-start justify-center" data-pdf-visible-page={shown?.start??''}
      data-pdf-visible-pages={shownEntries.map(entry=>entry.page).join(',')} data-pdf-pages-per-view={pagesPerView} aria-busy={pending}
      style={{width:Math.max(width,sheetWidth),gap:PDF_PAGE_GAP,...(!shown?{aspectRatio:pagesPerView===2?'1206 / 842':'595 / 842'}:{})}}>
      {pending && visible !== null && <p role="status" className="absolute right-3 top-3 z-20 rounded bg-slate-950/85 px-3 py-2 text-xs text-white">{start===end?start:`${start}–${end}`}페이지 준비 중…</p>}
      {/* Clip annotations to each paper and keep oversized spreads left-scrollable. */}
      {mounted.map(entry => {
        const isShown=shownEntries.includes(entry)
        return <div key={entry.url} data-pdf-buffer-page={entry.page} aria-hidden={!isShown} inert={!isShown}
          className={`shrink-0 overflow-hidden ${isShown?'relative':'hidden'}`} style={{width:paperWidth,height:paperWidth*entry.ratio,order:entry.page}}>
          <CachedPageImage url={entry.url} page={entry.page} width={paperWidth} height={paperWidth*entry.ratio}
            onDecoded={handleDecoded} onError={()=>{if(entry.page>=start && entry.page<=end)onError()}} />
          {isShown && overlay && <div className="absolute inset-0">{overlay(entry)}</div>}
        </div>
      })}
    </div>
  </div>
}
