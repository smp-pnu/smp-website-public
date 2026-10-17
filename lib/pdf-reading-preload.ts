import type { pdfjs } from 'react-pdf'

export type RenderablePdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>

export type ReadingDocument = {
  numPages: number
  getData: () => Promise<Uint8Array>
  getDownloadInfo?: () => Promise<{ length: number }>
}

// Called once the visible/adjacent canvases have warmed the first three pages.
// The returned whole-file buffer is not retained in React state.
export async function fillPdfReadingCache(pdf: ReadingDocument, options: {
  cancelled: () => boolean
  beforeFullDownload: () => Promise<boolean>
  started?: () => void
}) {
  if (options.cancelled() || !await options.beforeFullDownload() || options.cancelled()) return false
  const download = pdf.getData()
  options.started?.()
  await download
  return !options.cancelled()
}
