"use client"

import { memo, useCallback, useEffect, useState } from 'react'
import { Page } from 'react-pdf'
import type { RenderablePdfDocument } from '@/lib/pdf-reading-preload'
import { usePdfPageCache } from './use-pdf-page-cache'
import type { PagePackHint } from '@/lib/pdf-page-pack'

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

const PageLayers = memo(function PageLayers({ page, width, zoom, ratio, rasterWidth }: { page: number; width: number; zoom: number; ratio: number; rasterWidth?: number }) {
  const [renderedZoom, setRenderedZoom] = useState<number | null>(null)
  const density=Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6_000_000 / ((width * zoom) ** 2 * ratio)))
  const refine=zoom!==1 || (rasterWidth!==undefined && rasterWidth+1<width*density)
  return <Page pageNumber={page} width={width} scale={zoom} renderMode={refine ? 'canvas' : 'none'}
    devicePixelRatio={density}
    onRenderSuccess={() => setRenderedZoom(zoom)}
    className={`!bg-transparent ${renderedZoom !== zoom ? '[&>canvas]:opacity-0' : ''}`} loading={null} error={null} />
})

export function PdfBufferedPages({ pdf, page, width, zoom, prepareRemaining, onDemand, onReady, onInitialPagesReady, onError, url, pdfKey, pack }: {
  pdf: RenderablePdfDocument; page: number; width: number; zoom: number; prepareRemaining: boolean; onDemand: boolean
  onReady: (page: number) => void; onInitialPagesReady: () => void; onError: () => void
  url?: string; pdfKey?: string; pack?: PagePackHint
}) {
  const [visible, setVisible] = useState<number | null>(null)
  const [decoded, setDecoded] = useState<Set<string>>(() => new Set())
  useEffect(() => { setVisible(null); setDecoded(new Set()) }, [pdf, width])
  const handleDecoded = useCallback((url: string, ready: boolean) => setDecoded(previous => {
    if (previous.has(url) === ready) return previous
    const next = new Set(previous)
    if (ready) next.add(url); else next.delete(url)
    return next
  }), [])
  const state = usePdfPageCache(pdf, width, page, prepareRemaining, visible,url,pdfKey,pack)
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
  useEffect(() => {
    if (Array.from({ length: Math.min(3, pdf.numPages) }, (_, index) => index + 1).every(page => (state.entries.some(entry => entry.page === page) || state.failed.includes(page)))) onInitialPagesReady()
  }, [state.entries, state.failed, pdf.numPages, onInitialPagesReady])
  useEffect(() => { if (state.failed.includes(page)) onError() }, [state.failed, page, onError])
  const pending = shown !== page
  return <div data-pdf-prepared-pages={state.entries.length} data-pdf-cache-bytes={state.entries.reduce((sum, entry) => sum + entry.bytes, 0)} data-pdf-preparation={state.complete ? 'complete' : state.limited ? 'limited' : onDemand ? 'on-demand' : 'preparing'}>
    <p className="border-b border-white/10 px-4 py-2 text-xs text-slate-300" role="status">
      {state.complete ? '전체 페이지 준비 완료' : state.limited || state.failed.length || onDemand ? '준비된 페이지부터 읽을 수 있습니다' : `페이지 준비 중 · ${state.entries.length}/${pdf.numPages}`}
    </p>
    <div className="relative" data-pdf-visible-page={shown ?? ''} aria-busy={pending}
      style={shown === null ? { aspectRatio: '595 / 842' } : undefined}>
      {pending && visible !== null && <p role="status" className="absolute right-3 top-3 z-20 rounded bg-slate-950/85 px-3 py-2 text-xs text-white">{page}페이지 준비 중…</p>}
      {mounted.map(entry => <div key={entry.url} data-pdf-buffer-page={entry.page} aria-hidden={entry.page !== shown} inert={entry.page !== shown}
        className={entry.page === shown ? 'relative' : 'hidden'} style={{ width: width * zoom, height: width * zoom * entry.ratio }}>
        <CachedPageImage url={entry.url} page={entry.page} width={width * zoom} height={width * zoom * entry.ratio}
          onDecoded={handleDecoded} onError={() => { if (entry.page === page) onError() }} />
        {entry.page === shown && <div className="absolute inset-0">
          <PageLayers page={entry.page} width={width} zoom={zoom} ratio={entry.ratio} rasterWidth={entry.width} />
        </div>}
      </div>)}
    </div>
  </div>
}
