import "server-only"
import path from "node:path"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { createCanvas, type Canvas } from "@napi-rs/canvas"
import { streamPdf } from "./pdf-response"
import { pagePackMaxPages } from './pdf-page-pack'

const maxPdfBytes = 128 * 1024 * 1024
const assetPath = path.join(process.cwd(), "node_modules/pdfjs-dist")
let activePreviews = 0

// Run only when publishing or preparing a missing saved preview, never while
// serving an already prepared image. Drive thumbnails are capped at 1024px.
export async function renderPdfPreview(url: string) {
  // Bound memory during a burst of requests for different unprepared reports.
  if (activePreviews >= 2) throw new Error("Preview generation busy")
  activePreviews++
  try { return await renderFirstPage(await downloadPdfForPreview(url)) } finally { activePreviews-- }
}

export async function downloadPdfForPreview(url: string) {
  return (await downloadPdfSnapshot(url)).data
}

export async function downloadPdfSnapshot(url: string) {
  const signal = AbortSignal.timeout(80_000)
  const response = await streamPdf(url, "preview.pdf", false, signal)
  if (Number(response.headers.get("content-length")) > maxPdfBytes) {
    await response.body?.cancel()
    throw new Error("PDF too large for a saved preview")
  }
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxPdfBytes) throw new Error("PDF too large for a saved preview")
      chunks.push(value)
    }
  } catch (error) { await reader.cancel(); throw error } finally { reader.releaseLock() }
  const data = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
  chunks.length = 0
  signal.throwIfAborted()
  return {data, lastModified:response.headers.get("last-modified")}
}

export async function renderFirstPage(data: Uint8Array, signal = AbortSignal.timeout(30_000)) {
  return (await renderReaderPages(data, 1, signal)).pages[0].png
}

export async function renderReaderPages(data: Uint8Array, count = 3, signal = AbortSignal.timeout(60_000)) {
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Invalid preview page count")
  return renderPages(data, count, signal)
}
type RenderedPage = {page:number;png:Buffer;width:number;height:number}
export async function renderReaderPackPages(data: Uint8Array, save: (page: RenderedPage) => Promise<void>, signal = AbortSignal.timeout(150_000)) {
  return renderPages(data, pagePackMaxPages, signal, save)
}
async function renderPages(data: Uint8Array, count: number, signal: AbortSignal, save?: (page: RenderedPage) => Promise<void>) {
  signal.throwIfAborted()
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false,
    cMapUrl: `${assetPath}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assetPath}/standard_fonts/`, wasmUrl: `${assetPath}/wasm/`,
  })
  const abort = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  let canvas: Canvas | undefined
  try {
    const doc = await task.promise
    const pages: RenderedPage[]=[]
    if (save && doc.numPages > pagePackMaxPages) throw new Error("Report exceeds prepared page limit")
    for (let number=1;number<=Math.min(count,doc.numPages);number++) {
      const page = await doc.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2048 / base.width, 4096 / base.height, Math.sqrt(8_000_000 / (base.width * base.height)))
      const viewport = page.getViewport({ scale })
      canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D
      await page.render({ canvas: null, canvasContext: context, viewport }).promise
      signal.throwIfAborted()
      const image = {page:number,png:canvas.toBuffer("image/png"),width:canvas.width,height:canvas.height}
      if (save) await save(image); else pages.push(image)
      canvas.width=0;canvas.height=0;page.cleanup()
    }
    return {pageCount:doc.numPages,pages}
  } finally {
    signal.removeEventListener("abort", abort)
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    await task.destroy()
  }
}
