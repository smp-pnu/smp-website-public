import type { PDFDocumentLoadingTask } from "pdfjs-dist"
import { limits, validateFile } from "./model"
import { extractFields } from "./extract"
import { cloudMode } from "./mode"
import { fileIdentity } from "../admin-cloud/protocol"
import { readPdfText } from "./pdf-text"
import { encodePdfCover } from "./pdf-cover"

export async function fingerprint(file: File, signal: AbortSignal) {
  validateFile(file)
  const bytes = new Uint8Array(await file.arrayBuffer())
  signal.throwIfAborted()
  if (!/^%PDF-\d\.\d/.test(new TextDecoder().decode(bytes.slice(0, 12)))) throw Error("PDF 헤더를 확인하지 못했어요. 파일 확장자만 바꾼 자료는 사용할 수 없어요.")
  if (cloudMode) return { bytes, hash: await fileIdentity(bytes) }
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  signal.throwIfAborted()
  return { bytes, hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") }
}

export async function analyzePdf(filename: string, bytes: Uint8Array, signal: AbortSignal, progress: (label: string) => void, existingCover?: Blob) {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"
  let task: PDFDocumentLoadingTask | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectCancelled: (error: Error) => void = () => {}
  const stopped = new Promise<never>((_, reject) => { rejectCancelled = reject })
  const abort = () => {
    rejectCancelled(Error("PDF 준비를 취소했어요. 다시 추가할 수 있어요."))
    void task?.destroy().catch(() => {})
  }
  signal.addEventListener("abort", abort, { once: true })
  try {
    signal.throwIfAborted()
    task = pdfjs.getDocument({ data: bytes, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/", enableXfa: false })
    task.onPassword = () => {
      rejectCancelled(Error("암호가 걸린 PDF예요. 암호를 해제한 사본으로 다시 시도해 주세요."))
      void task?.destroy().catch(() => {})
    }
    timer = setTimeout(() => {
      rejectCancelled(Error("30초 안에 분석하지 못했어요. PDF를 최적화하거나 작은 파일로 다시 시도해 주세요."))
      void task?.destroy().catch(() => {})
    }, limits.timeoutMs)
    return await Promise.race([stopped, (async () => {
      const pdf = await task!.promise
      if (pdf.numPages > limits.pages) throw Error("시험판에서는 120페이지 이하 PDF만 처리해요.")
      const texts: string[] = []
      for (let number = 1; number <= Math.min(pdf.numPages, limits.extractPages); number++) {
        progress(`${number}페이지에서 입력 후보를 찾는 중`)
        signal.throwIfAborted()
        const page = await pdf.getPage(number)
        try { texts.push(await readPdfText(page.streamTextContent(), signal)) }
        finally { page.cleanup() }
      }
      if (existingCover) return { ...extractFields(filename, texts), cover: existingCover, pages: pdf.numPages, sourcePages: texts }
      progress("첫 페이지 표지를 만드는 중")
      const page = await pdf.getPage(1)
      const natural = page.getViewport({ scale: 1 })
      const scale = Math.min(1200 / natural.width, Math.sqrt(2_000_000 / (natural.width * natural.height)))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height))
      const context = canvas.getContext("2d")
      if (!context) throw Error("이 브라우저에서 표지를 만들 수 없어요.")
      let cover: Blob
      try {
        await page.render({ canvas, canvasContext: context, viewport, background: "white" }).promise
        cover = await encodePdfCover(canvas, signal)
      } finally { canvas.width = 1; canvas.height = 1; page.cleanup() }
      signal.throwIfAborted()
      return { ...extractFields(filename, texts), cover, pages: pdf.numPages, sourcePages: texts }
    })()])
  } catch (error) {
    if (error instanceof Error && error.name === "InvalidPDFException") throw Error("PDF 구조가 손상됐어요. 원본을 다시 저장한 뒤 추가해 주세요.")
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", abort)
    await task?.destroy().catch(() => {})
  }
}
