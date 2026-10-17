import type { RenderablePdfDocument } from '@/lib/pdf-reading-preload'
import type { PreparedPdfPage } from './pdf-page-cache'
import { encodePdfPageImage } from './pdf-page-encoding'

export async function renderPdfPageImage(pdf: RenderablePdfDocument, page: number, width: number, signal: AbortSignal): Promise<PreparedPdfPage> {
  const source = await pdf.getPage(page)
  if (signal.aborted) throw new Error('Cancelled')
  const unit = source.getViewport({ scale: 1 })
  const ratio = unit.height / unit.width
  const maxPixels = width < 600 ? 3_000_000 : 6_000_000
  const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(maxPixels / (width * width * ratio)))
  const viewport = source.getViewport({ scale: width * density / unit.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const task = source.render({ canvas, viewport, background: '#ffffff' })
  const cancel = () => task.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await task.promise
    const blob = await encodePdfPageImage(canvas, signal)
    if (signal.aborted) throw new Error('Cancelled')
    return { page, url: URL.createObjectURL(blob), bytes: blob.size, ratio, width:canvas.width }
  } finally {
    signal.removeEventListener('abort', cancel)
    canvas.width = canvas.height = 0
    // This releases per-page image/operator resources after rendering, not the PDF bytes.
    source.cleanup()
  }
}
