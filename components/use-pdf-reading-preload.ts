"use client"

import { useEffect, useState } from 'react'
import { preloadPdfReading, type ReadingDocument } from '@/lib/pdf-reading-preload'

export function usePdfReadingPreload(pdf: ReadingDocument | undefined, firstPaint: boolean, bounded: boolean) {
  const [complete, setComplete] = useState(false)
  useEffect(() => {
    if (!pdf || !firstPaint) return
    const abort = new AbortController()
    setComplete(false)
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const full = bounded && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    void preloadPdfReading(pdf, {
      cancelled: () => abort.signal.aborted,
      beforeFullDownload: async () => {
        if (!full) return false
        if (document.visibilityState === 'visible') return true
        return new Promise<boolean>(resolve => {
          const finish = (value: boolean) => { document.removeEventListener('visibilitychange', visible); resolve(value) }
          const visible = () => { if (document.visibilityState === 'visible') finish(true) }
          document.addEventListener('visibilitychange', visible, { signal: abort.signal })
          abort.signal.addEventListener('abort', () => finish(false), { once: true })
        })
      },
    }).then(done => { if (!abort.signal.aborted) setComplete(done) }).catch(() => { /* Existing per-page loading remains available. */ })
    return () => abort.abort()
  }, [pdf, firstPaint, bounded])
  return complete
}
