import "server-only"
import path from "node:path"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { createCanvas, type Canvas } from "@napi-rs/canvas"
import { streamPdf } from "./pdf-response"

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
  return data
}

export async function renderFirstPage(data: Uint8Array, signal = AbortSignal.timeout(30_000)) {
  signal.throwIfAborted()
  const task = getDocument({ data, useSystemFonts: false,
    cMapUrl: `${assetPath}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assetPath}/standard_fonts/`, wasmUrl: `${assetPath}/wasm/`,
  })
  const abort = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  let canvas: Canvas | undefined
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2048 / base.width, Math.sqrt(8_000_000 / (base.width * base.height)))
    const viewport = page.getViewport({ scale })
    canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D
    await page.render({ canvas: null, canvasContext: context, viewport }).promise
    signal.throwIfAborted()
    return canvas.toBuffer("image/png")
  } finally {
    signal.removeEventListener("abort", abort)
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    await task.destroy()
  }
}
