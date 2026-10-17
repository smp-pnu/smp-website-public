"use client"

import { useEffect, useReducer } from 'react'
import { Page } from 'react-pdf'
import { createPdfPageBuffer, updatePdfPageBuffer } from '@/lib/pdf-page-buffer'

export function PdfBufferedPages({ page, total, width, zoom, onReady, onError }: {
  page: number; total: number; width: number; zoom: number
  onReady: (page: number) => void; onError: () => void
}) {
  const [buffer, dispatch] = useReducer((state: ReturnType<typeof createPdfPageBuffer>, event: Parameters<typeof updatePdfPageBuffer>[1]) => updatePdfPageBuffer(state, event, total, zoom === 1), page, createPdfPageBuffer)
  useEffect(() => { dispatch({ type: 'request', page }) }, [page])
  useEffect(() => { if (buffer.visible !== null) onReady(buffer.visible) }, [buffer.visible, onReady])
  const pending = buffer.visible !== page
  return <div className="relative" data-pdf-visible-page={buffer.visible ?? ''} aria-busy={pending}
    style={buffer.visible === null ? { aspectRatio: '595 / 842' } : undefined}>
    {pending && buffer.visible !== null && <p role="status" className="absolute right-3 top-3 z-10 rounded bg-slate-950/85 px-3 py-2 text-xs text-white">{page}페이지 준비 중…</p>}
    {buffer.entries.map(entry => {
      const shown = entry.page === buffer.visible
      return <div key={entry.page} data-pdf-buffer-page={entry.page} aria-hidden={!shown} inert={!shown}
        className={shown ? 'relative' : 'pointer-events-none absolute inset-x-0 top-0 opacity-0'}>
        <Page pageNumber={entry.page} width={width} scale={zoom} devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6_000_000 / ((width * zoom) ** 2 * 1.5)))}
          loading={null} error={null}
          onRenderSuccess={() => dispatch({ type: 'ready', page: entry.page })}
          onLoadError={() => { dispatch({ type: 'failed', page: entry.page }); if (entry.page === page) onError() }}
          onRenderError={() => { dispatch({ type: 'failed', page: entry.page }); if (entry.page === page) onError() }} />
      </div>
    })}
  </div>
}
