"use client"

import { useEffect, useState } from 'react'
import { fillPdfReadingCache, type ReadingDocument } from '@/lib/pdf-reading-preload'

export function usePdfReadingPreload(pdf: ReadingDocument | undefined, initialPagesReady: boolean, bounded: boolean) {
  type State = 'pending' | 'loading' | 'complete' | 'on-demand'
  const [result, setResult] = useState<{ pdf: ReadingDocument; state: State }>()
  useEffect(() => {
    if (!pdf || !initialPagesReady) return
    const abort = new AbortController()
    const setState = (state: State) => setResult({ pdf, state })
    setState('pending')
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const full = !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    if (!full) { setState('on-demand'); return () => abort.abort() }
    if (!bounded) {
      // Legacy streams may already contain the entire file. Observe completion;
      // never force an unbounded Drive download just to prepare page images.
      void pdf.getDownloadInfo?.().then(() => { if (!abort.signal.aborted) setState('complete') }).catch(() => { if (!abort.signal.aborted) setState('on-demand') })
      return () => abort.abort()
    }
    void fillPdfReadingCache(pdf, {
      cancelled: () => abort.signal.aborted,
      // Start preparing subsequent pages while the bounded transfer continues.
      // PDF.js shares its existing byte cache and prioritizes needed ranges.
      started: () => { if (!abort.signal.aborted) setState('loading') },
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
    }).then(done => { if (!abort.signal.aborted) setState(done ? 'complete' : 'on-demand') }).catch(() => { if (!abort.signal.aborted) setState('on-demand') })
    return () => abort.abort()
  }, [pdf, initialPagesReady, bounded])
  return initialPagesReady && result && result.pdf === pdf ? result.state : 'pending'
}
