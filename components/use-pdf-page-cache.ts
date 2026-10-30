"use client"

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { RenderablePdfDocument } from '@/lib/pdf-reading-preload'
import { PdfPageCache, type PdfPreparation } from '@/lib/pdf-page-cache'
import { renderPdfPageImage } from '@/lib/pdf-page-image'
import type { PdfPagesPerView } from '@/lib/pdf-reader-layout'

const empty: PdfPreparation = { entries: [], complete: false, limited: false, failed: [] }

export function usePdfPageCache(pdf: RenderablePdfDocument, width: number, page: number, full: boolean, visible: number | null, pagesPerView:PdfPagesPerView=1) {
  const cache = useRef<PdfPageCache | null>(null)
  const [state, setState] = useState(empty)
  const currentPage = useEffectEvent(() => ({page,pagesPerView}))
  const renderPage = useEffectEvent((page:number,signal:AbortSignal)=>renderPdfPageImage(pdf,page,width,signal))
  useEffect(() => {
    setState(empty)
    const controller = new PdfPageCache({ total: pdf.numPages, maxBytes: (width < 600 ? 32 : 64) * 1024 * 1024,
      render: async (page, signal) => renderPage(page, signal),
      release: entry => URL.revokeObjectURL(entry.url), changed: setState,
      yield: () => new Promise(resolve => setTimeout(resolve, 16)),
    })
    cache.current = controller
    const visibility = () => controller.pause(document.visibilityState !== 'visible')
    visibility()
    const current=currentPage()
    controller.request(current.page,current.pagesPerView)
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); controller.dispose(); cache.current = null }
  }, [pdf])
  useEffect(() => { cache.current?.request(page,pagesPerView) }, [page, pdf, pagesPerView])
  useEffect(() => { if (full) cache.current?.prepareRest() }, [full, pdf])
  useEffect(() => { if (visible !== null) cache.current?.show(visible,pagesPerView) }, [visible, pdf, pagesPerView])
  return state
}
