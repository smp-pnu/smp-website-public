// Shared metadata only. Conversion and PDF bytes never enter the browser bundle.
export const readerVersion = 1
export const readerPdfMaxBytes = 24 * 1024 * 1024
export const readerPdfChunkBytes = 1 * 1024 * 1024
export const readerPdfChunkedMaxBytes = 32 * 1024 * 1024
export type ReaderPdf = { url: string; bytes: number; chunkSize?: number; sourceBytes: number; sourceModified: string; checkedAt: number }
export function readerPdfParts(pdf: Pick<ReaderPdf, "url" | "bytes" | "chunkSize">) {
  if (!pdf.chunkSize) return [{url:pdf.url,bytes:pdf.bytes,start:0}]
  return Array.from({length:Math.ceil(pdf.bytes/pdf.chunkSize)},(_,i)=>({
    url:pdf.url.replace(/\.pdf$/,`.${String(i).padStart(4,"0")}.bin`),
    bytes:Math.min(pdf.chunkSize!,pdf.bytes-i*pdf.chunkSize!),start:i*pdf.chunkSize!,
  }))
}
export type ReaderPage = { page: number; url: string; width: number; height: number }
export type ReaderPreview = { version: 1; pageCount: number; pages: ReaderPage[]; rangeOnly?: true }
export type PreparedReader = ReaderPreview & {
  pdf?: ReaderPdf
}
export function readerPreview(id: string, value: unknown): ReaderPreview | undefined {
  if (!value || typeof value !== "object") return
  const v = value as PreparedReader
  if (v.version !== readerVersion || !Number.isSafeInteger(v.pageCount) || v.pageCount < 1 || v.pageCount > 10000
    || !Array.isArray(v.pages) || v.pages.length !== Math.min(3, v.pageCount)) return
  const path = new RegExp(`^/report-covers/${id}/[a-f0-9]{64}\\.webp$`)
  if (!/^[a-f0-9]{32}$/.test(id) || v.pages.some((p, i) => !p || p.page !== i + 1 || !path.test(p.url)
    || ![p.width,p.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 4096))) return
  return { version: 1, pageCount: v.pageCount, pages: v.pages.map(({page,url,width,height}) => ({page,url,width,height})) }
}
export function preparedReader(id: string, value: unknown): PreparedReader | undefined {
  const preview = readerPreview(id, value)
  if (!preview) return
  const pdf = (value as PreparedReader).pdf
  if (!pdf) return preview
  if (!new RegExp(`^/_reader-pdfs/${id}/[a-f0-9]{64}\\.pdf$`).test(pdf.url)
    || (pdf.chunkSize !== undefined && pdf.chunkSize !== readerPdfChunkBytes)
    || !Number.isSafeInteger(pdf.bytes) || pdf.bytes < 5 || pdf.bytes > (pdf.chunkSize ? readerPdfChunkedMaxBytes : readerPdfMaxBytes)
    || !Number.isSafeInteger(pdf.sourceBytes) || pdf.sourceBytes < 5 || pdf.sourceBytes > 128 * 1024 * 1024
    || typeof pdf.sourceModified !== "string" || !Number.isFinite(Date.parse(pdf.sourceModified))
    || !Number.isSafeInteger(pdf.checkedAt) || pdf.checkedAt <= 0) return
  return { ...preview, pdf: {url:pdf.url,bytes:pdf.bytes,...(pdf.chunkSize?{chunkSize:pdf.chunkSize}:{}),sourceBytes:pdf.sourceBytes,sourceModified:pdf.sourceModified,checkedAt:pdf.checkedAt} }
}
