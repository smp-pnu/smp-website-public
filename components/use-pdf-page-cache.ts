"use client"

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { RenderablePdfDocument } from '@/lib/pdf-reading-preload'
import { PdfPageCache, type PdfPreparation } from '@/lib/pdf-page-cache'
import { renderPdfPageImage } from '@/lib/pdf-page-image'

const empty: PdfPreparation = { entries: [], complete: false, limited: false, failed: [] }

export function usePdfPageCache(pdf: RenderablePdfDocument, width: number, page: number, full: boolean, visible: number | null) {
  const cache = useRef<PdfPageCache | null>(null)
  const [state, setState] = useState(empty)
  const currentPage = useEffectEvent(() => page)
  useEffect(() => {
    setState(empty)
    const controller = new PdfPageCache({ total: pdf.numPages, maxBytes: (width < 600 ? 32 : 64) * 1024 * 1024,
      render: (page, signal) => renderPdfPageImage(pdf, page, width, signal),
      release: entry => URL.revokeObjectURL(entry.url), changed: setState,
      yield: () => new Promise(resolve => setTimeout(resolve, 16)),
    })
    cache.current = controller
    const visibility = () => controller.pause(document.visibilityState !== 'visible')
    visibility()
    controller.request(currentPage())
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); controller.dispose(); cache.current = null }
  }, [pdf, width])
  useEffect(() => { cache.current?.request(page) }, [page, pdf, width])
  useEffect(() => { if (full) cache.current?.prepareRest() }, [full, pdf, width])
  useEffect(() => { if (visible !== null) cache.current?.show(visible) }, [visible])
  return state
}
