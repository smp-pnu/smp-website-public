// Shared metadata only. Conversion and PDF bytes never enter the browser bundle.
import { pagePackMaxBytes, pagePackMaxPages, type PagePackAsset, type PagePackHint } from './pdf-page-pack'
export const readerVersion = 1
export const readerPdfMaxBytes = 24 * 1024 * 1024
export const readerPdfChunkBytes = 1 * 1024 * 1024
export const readerPdfChunkedMaxBytes = 32 * 1024 * 1024
export type ReaderTransport = {key:string;bytes:number;chunks:number[]}
export type ReaderPdf = { url: string; bytes: number; chunkSize?: number; initialChunks?: number[]; sourceBytes: number; sourceModified: string; checkedAt: number }
export function readerPdfParts(pdf: Pick<ReaderPdf, "url" | "bytes" | "chunkSize">) {
  if (!pdf.chunkSize) return [{url:pdf.url,bytes:pdf.bytes,start:0}]
  return Array.from({length:Math.ceil(pdf.bytes/pdf.chunkSize)},(_,i)=>({
    url:pdf.url.replace(/\.pdf$/,`.${String(i).padStart(4,"0")}.bin`),
    bytes:Math.min(pdf.chunkSize!,pdf.bytes-i*pdf.chunkSize!),start:i*pdf.chunkSize!,
  }))
}
export type ReaderPage = { page: number; url: string; width: number; height: number }
export type ReaderPreview = { version: 1; pageCount: number; pages: ReaderPage[]; rangeOnly?: true; transport?:ReaderTransport; pack?:PagePackHint }
export type PreparedReader = ReaderPreview & {
  pdf?: ReaderPdf
  pagePack?: PagePackAsset
  pagePackVersion?: 1
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
  const attempted = (value as PreparedReader).pagePackVersion
  if (attempted !== undefined && attempted !== 1) return
  const base = {...preview,...(attempted ? {pagePackVersion:1 as const} : {})}
  const pdf = (value as PreparedReader).pdf
  if (!pdf) return base
  if (!new RegExp(`^/_reader-pdfs/${id}/[a-f0-9]{64}\\.pdf$`).test(pdf.url)
    || (pdf.chunkSize !== undefined && pdf.chunkSize !== readerPdfChunkBytes)
    || !Number.isSafeInteger(pdf.bytes) || pdf.bytes < 5 || pdf.bytes > (pdf.chunkSize ? readerPdfChunkedMaxBytes : readerPdfMaxBytes)
    || (pdf.initialChunks!==undefined && (!pdf.chunkSize || !Array.isArray(pdf.initialChunks) || pdf.initialChunks.length<1 || pdf.initialChunks.length>8 || pdf.initialChunks[0]!==0 || pdf.initialChunks.some((n,i,a)=>!Number.isSafeInteger(n)||n<0||n>=Math.ceil(pdf.bytes/pdf.chunkSize!)||(i>0&&n<=a[i-1]))))
    || !Number.isSafeInteger(pdf.sourceBytes) || pdf.sourceBytes < 5 || pdf.sourceBytes > 128 * 1024 * 1024
    || typeof pdf.sourceModified !== "string" || !Number.isFinite(Date.parse(pdf.sourceModified))
    || !Number.isSafeInteger(pdf.checkedAt) || pdf.checkedAt <= 0) return
  const pack = (value as PreparedReader).pagePack
  if (pack && (!new RegExp(`^/_reader-pdfs/${id}/[a-f0-9]{64}\\.pack$`).test(pack.url)
    || !Number.isSafeInteger(pack.bytes) || pack.bytes < 14 || pack.bytes > pagePackMaxBytes || preview.pageCount > pagePackMaxPages)) return
  return { ...base, ...(pack ? {pagePack:{url:pack.url,bytes:pack.bytes}} : {}), pdf: {url:pdf.url,bytes:pdf.bytes,...(pdf.chunkSize?{chunkSize:pdf.chunkSize}:{}),...(pdf.initialChunks?{initialChunks:[...pdf.initialChunks]}:{}),sourceBytes:pdf.sourceBytes,sourceModified:pdf.sourceModified,checkedAt:pdf.checkedAt} }
}
