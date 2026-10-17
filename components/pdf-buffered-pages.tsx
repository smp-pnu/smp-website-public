"use client"

import { memo, useCallback, useEffect, useState } from 'react'
import { Page } from 'react-pdf'
import type { RenderablePdfDocument } from '@/lib/pdf-reading-preload'
import { usePdfPageCache } from './use-pdf-page-cache'
import { PdfPageImages } from './pdf-page-images'

const PageLayers = memo(function PageLayers({ page, width, zoom, ratio, rasterWidth }: { page: number; width: number; zoom: number; ratio: number; rasterWidth?: number }) {
  const [renderedSize, setRenderedSize] = useState<string | null>(null)
  const renderSize=`${page}:${width}:${zoom}`
  const density=Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6_000_000 / ((width * zoom) ** 2 * ratio)))
  const refine=zoom!==1 || (rasterWidth!==undefined && rasterWidth+1<width*density)
  return <Page pageNumber={page} width={width} scale={zoom} renderMode={refine ? 'canvas' : 'none'}
    devicePixelRatio={density}
    onRenderSuccess={() => setRenderedSize(renderSize)}
    className={`!bg-transparent ${renderedSize !== renderSize ? '[&>canvas]:opacity-0' : ''}`} loading={null} error={null} />
})

export function PdfBufferedPages({ pdf, page, width, zoom, prepareRemaining, onDemand, onReady, onInitialPagesReady, onError }: {
  pdf: RenderablePdfDocument; page: number; width: number; zoom: number; prepareRemaining: boolean; onDemand: boolean
  onReady: (page: number) => void; onInitialPagesReady: () => void; onError: () => void
}) {
  const [visible,setVisible]=useState<number|null>(null)
  const state=usePdfPageCache(pdf,width,page,prepareRemaining,visible)
  const ready=useCallback((value:number)=>{setVisible(value);onReady(value)},[onReady])
  useEffect(() => {
    if (Array.from({ length: Math.min(3, pdf.numPages) }, (_, index) => index + 1).every(page => (state.entries.some(entry => entry.page === page) || state.failed.includes(page)))) onInitialPagesReady()
  }, [state.entries, state.failed, pdf.numPages, onInitialPagesReady])
  useEffect(() => { if (state.failed.includes(page)) onError() }, [state.failed, page, onError])
  return <PdfPageImages state={state} identity={pdf} page={page} width={width} zoom={zoom} onDemand={onDemand} onReady={ready} onError={onError}
    overlay={entry=><PageLayers page={entry.page} width={width} zoom={zoom} ratio={entry.ratio} rasterWidth={entry.width} />} />
}
