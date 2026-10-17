"use client"

import { useEffect, useState } from 'react'
import { fillPdfReadingCache, type ReadingDocument } from '@/lib/pdf-reading-preload'

export function usePdfReadingPreload(pdf: ReadingDocument | undefined, initialPagesReady: boolean, bounded: boolean) {
  const [complete, setComplete] = useState(false)
  useEffect(() => {
    if (!pdf || !initialPagesReady) return
    const abort = new AbortController()
    setComplete(false)
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const full = !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    if (!bounded) {
      // Legacy streams may already contain the entire file. Observe completion;
      // never force an unbounded Drive download just to prepare page images.
      if (full) void pdf.getDownloadInfo?.().then(() => { if (!abort.signal.aborted) setComplete(true) }).catch(() => {})
      return () => abort.abort()
    }
    void fillPdfReadingCache(pdf, {
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
  }, [pdf, initialPagesReady, bounded])
  return complete
}
