import "server-only"
import path from "node:path"
import { streamPdf } from "./pdf-response"

// Text extraction is an upload-time fallback, never a page-view dependency.
export async function readReportPdfText(url: string) {
  const signal = AbortSignal.timeout(30_000)
  const response = await streamPdf(url, "report.pdf", false, signal)
  const maxBytes = 32 * 1024 * 1024
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); return "" }
  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxBytes) { await reader.cancel(); return "" }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const root = path.join(process.cwd(), "node_modules/pdfjs-dist")
  const task = getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: false,
    cMapUrl: `${root}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}/standard_fonts/`, wasmUrl: `${root}/wasm/`,
  })
  const abort = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    signal.throwIfAborted()
    const doc = await task.promise
    const pages: string[] = []
    for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""))
    }
    return pages.join("\n").slice(0, 30_000)
  } finally { signal.removeEventListener("abort", abort); await task.destroy() }
}
