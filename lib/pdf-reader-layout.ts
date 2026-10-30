export type PdfPagesPerView = 1 | 2
export const PDF_PAGE_GAP = 16
export const PDF_ZOOM_LEVELS = [0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const

export function pdfSpread(page: number, total: number, count: PdfPagesPerView) {
  const current = Math.max(1, Math.min(Math.max(1, total), Math.floor(page)))
  const start = current - (current - 1) % count
  const end = Math.min(total, start + count - 1)
  return { start, end, pages: Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i) }
}

export function pdfPaperWidth(viewport: number, count: PdfPagesPerView) {
  return Math.max(1, Math.floor((viewport - PDF_PAGE_GAP * (count - 1)) / count))
}
