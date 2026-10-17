"use client"

import {useCallback,useEffect,useState,type ReactNode} from 'react'
import type {PdfPreparation,PreparedPdfPage} from '@/lib/pdf-page-cache'

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

export function PdfPageImages({state,identity,page,width,zoom,onDemand=false,onReady,onError,overlay}: {
  state:PdfPreparation;identity:unknown;page:number;width:number;zoom:number;onDemand?:boolean
  onReady:(page:number)=>void;onError:()=>void;overlay?:(entry:PreparedPdfPage)=>ReactNode
}) {
  const [visible, setVisible] = useState<number | null>(null)
  const [decoded, setDecoded] = useState<Set<string>>(() => new Set())
  useEffect(() => { setVisible(null); setDecoded(new Set()) }, [identity])
  const handleDecoded = useCallback((url: string, ready: boolean) => setDecoded(previous => {
    if (previous.has(url) === ready) return previous
    const next = new Set(previous)
    if (ready) next.add(url); else next.delete(url)
    return next
  }), [])
  const requested = state.entries.find(entry => entry.page === page)
  const current = state.entries.find(entry => entry.page === visible)
  // Only three images are mounted/decoded. All other pages remain compressed blobs.
  const next = state.entries.find(entry => entry.page === page + 1)
  const mounted = [...new Set([current, requested, next])].filter(entry => entry !== undefined)
  const ready = requested && decoded.has(requested.url)
  const shown = ready ? page : visible
  useEffect(() => {
    if (ready) { setVisible(page); onReady(page) }
  }, [ready, page, onReady])
  const pending = shown !== page
  return <div data-pdf-prepared-pages={state.entries.length} data-pdf-cache-bytes={state.entries.reduce((sum, entry) => sum + entry.bytes, 0)} data-pdf-preparation={state.complete ? 'complete' : state.limited ? 'limited' : onDemand ? 'on-demand' : 'preparing'}>
    <p className="border-b border-white/10 px-4 py-2 text-xs text-slate-300" role="status">
      {state.complete ? '전체 페이지 준비 완료' : state.limited || state.failed.length || onDemand ? '준비된 페이지부터 읽을 수 있습니다' : `페이지 준비 중 · ${state.entries.length}`}
    </p>
    <div className="relative" data-pdf-visible-page={shown ?? ''} aria-busy={pending}
      style={shown === null ? { aspectRatio: '595 / 842' } : undefined}>
      {pending && visible !== null && <p role="status" className="absolute right-3 top-3 z-20 rounded bg-slate-950/85 px-3 py-2 text-xs text-white">{page}페이지 준비 중…</p>}
      {/* PDF annotations may extend beyond the page. Keep them inside the paper so
          they cannot create scrollbars and repeatedly reset the width-based cache. */}
      {mounted.map(entry => <div key={entry.url} data-pdf-buffer-page={entry.page} aria-hidden={entry.page !== shown} inert={entry.page !== shown}
        className={`overflow-hidden ${entry.page === shown ? 'relative' : 'hidden'}`} style={{ width: width * zoom, height: width * zoom * entry.ratio }}>
        <CachedPageImage url={entry.url} page={entry.page} width={width * zoom} height={width * zoom * entry.ratio}
          onDecoded={handleDecoded} onError={() => { if (entry.page === page) onError() }} />
        {entry.page === shown && overlay && <div className="absolute inset-0">
          {overlay?.(entry)}
        </div>}
      </div>)}
    </div>
  </div>
}
