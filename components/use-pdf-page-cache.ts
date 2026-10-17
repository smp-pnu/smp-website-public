"use client"

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { RenderablePdfDocument } from '@/lib/pdf-reading-preload'
import { PdfPageCache, type PdfPreparation } from '@/lib/pdf-page-cache'
import { renderPdfPageImage } from '@/lib/pdf-page-image'
import { createPagePackLoader } from '@/lib/pdf-page-pack-loader'
import type { PagePackHint } from '@/lib/pdf-page-pack'

const empty: PdfPreparation = { entries: [], complete: false, limited: false, failed: [] }

export function usePdfPageCache(pdf: RenderablePdfDocument, width: number, page: number, full: boolean, visible: number | null, url?: string, pdfKey?: string, pack?: PagePackHint) {
  const cache = useRef<PdfPageCache | null>(null)
  const packed = useRef<ReturnType<typeof createPagePackLoader> | null>(null)
  const packKey=pack?.key, packBytes=pack?.bytes
  const [state, setState] = useState(empty)
  const currentPage = useEffectEvent(() => page)
  useEffect(() => {
    const connection = (navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection
    const allowed = !connection?.saveData && !['slow-2g','2g'].includes(connection?.effectiveType??'')
    const loader=allowed && url && pdfKey && packKey && packBytes ? createPagePackLoader(url,pdfKey,{key:packKey,bytes:packBytes},pdf.numPages) : null
    packed.current=loader
    return ()=>{loader?.dispose();packed.current=null}
  },[pdf,url,pdfKey,packKey,packBytes])
  useEffect(() => {
    setState(empty)
    const saved=packed.current
    const controller = new PdfPageCache({ total: pdf.numPages, maxBytes: (width < 600 ? 32 : 64) * 1024 * 1024,
      render: async (page, signal) => (await saved?.read(page,signal)) ?? renderPdfPageImage(pdf, page, width, signal),
      release: entry => URL.revokeObjectURL(entry.url), changed: setState,
      yield: () => new Promise(resolve => setTimeout(resolve, 16)),
    })
    cache.current = controller
    const visibility = () => controller.pause(document.visibilityState !== 'visible')
    visibility()
    controller.request(currentPage())
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); controller.dispose(); cache.current = null }
  }, [pdf, width, url, pdfKey, packKey, packBytes])
  useEffect(() => { cache.current?.request(page) }, [page, pdf, width])
  useEffect(() => { if (full) cache.current?.prepareRest() }, [full, pdf, width, url, pdfKey, packKey, packBytes])
  useEffect(() => { if (visible !== null) cache.current?.show(visible) }, [visible, pdf, width, url, pdfKey, packKey, packBytes])
  return state
}
