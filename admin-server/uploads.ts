import { createHash } from "node:crypto"
import { Worker } from "node:worker_threads"
import sharp from "sharp"
import { limits, validateFile } from "../admin-lab/model"
import { fields, evidence, warnings, object, text, HttpError } from "./validation"
export const maxUploadBytes = limits.fileBytes + 1024 * 1024 + 100_000
export async function boundedBody(request: Request, maximum: number) {
  const declared = request.headers.get("content-length")
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new HttpError(413, "요청 용량 한도를 초과했어요.")
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, "요청 내용이 없어요.")
  const chunks: Uint8Array[] = []; let bytes = 0
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break
      bytes += item.value.byteLength
      if (bytes > maximum) { await reader.cancel(); throw new HttpError(413, "요청 용량 한도를 초과했어요.") }
      chunks.push(item.value)
    }
    return Buffer.concat(chunks, bytes)
  } finally { reader.releaseLock() }
}
export async function jsonBody(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new HttpError(415, "JSON 요청이 필요해요.")
  try { return JSON.parse((await boundedBody(request, 50_000)).toString("utf8")) }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "요청 내용을 읽지 못했어요.") }
}
function pdfPages(bytes: Uint8Array, signal: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(new URL("./pdf-check.mjs", import.meta.url), { workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 128 } })
    const finish = (error?: Error, pages?: number) => {
      clearTimeout(timer); signal.removeEventListener("abort", cancel); void worker.terminate()
      error ? reject(error) : resolve(pages!)
    }
    const cancel = () => finish(new HttpError(400, "업로드를 취소했어요."))
    const timer = setTimeout(() => finish(new HttpError(422, "PDF 검증 시간이 초과됐어요. 최적화한 파일로 다시 시도해 주세요.")), 20_000)
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) { cancel(); return }
    worker.once("error", () => finish(new HttpError(422, "PDF 검증에 실패했어요.")))
    worker.once("exit", code => { if (code !== 0) finish(new HttpError(422, "PDF 검증을 완료하지 못했어요.")) })
    worker.once("message", result => {
      if (result.error || !Number.isSafeInteger(result.pages) || result.pages < 1 || result.pages > limits.pages) finish(new HttpError(422, result.error ?? "120페이지 이하의 PDF가 필요해요."))
      else finish(undefined, result.pages)
    })
  })
}
export async function validateUpload(request: Request) {
  if (!/^multipart\/form-data;/.test(request.headers.get("content-type") ?? "")) throw new HttpError(415, "PDF 업로드 형식을 확인해 주세요.")
  const body = await boundedBody(request, maxUploadBytes)
  let form: FormData
  try { form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData() }
  catch { throw new HttpError(400, "업로드 내용을 읽지 못했어요.") }
  if ([...form.keys()].length !== 3) throw new HttpError(400, "PDF·표지·입력 정보만 업로드할 수 있어요.")
  const pdf = form.get("pdf"), cover = form.get("cover"), metadata = form.get("metadata")
  if (!(pdf instanceof File) || !(cover instanceof File) || typeof metadata !== "string" || metadata.length > 50_000) throw new HttpError(400, "PDF·표지·입력 정보가 필요해요.")
  try { validateFile(pdf) } catch (error) { throw new HttpError(400, (error as Error).message) }
  if (cover.size > 1024 * 1024 || !cover.size) throw new HttpError(413, "표지 용량은 1 MB 이하여야 해요.")
  const bytes = new Uint8Array(await pdf.arrayBuffer())
  if (!/^%PDF-\d\.\d/.test(Buffer.from(bytes.subarray(0, 12)).toString())) throw new HttpError(400, "PDF 헤더가 올바르지 않아요.")
  const pages = await pdfPages(bytes, request.signal)
  let parsed: Record<string, unknown>
  try { parsed = object(JSON.parse(metadata)) } catch { throw new HttpError(400, "입력 정보를 확인해 주세요.") }
  const filename = text(parsed.filename, 240)
  if (!/\.pdf$/i.test(filename) || /[\/\\\r\n]/.test(filename)) throw new HttpError(400, "파일 이름을 확인해 주세요.")
  let image: Buffer
  try {
    const input = sharp(Buffer.from(await cover.arrayBuffer()), { limitInputPixels: 2_100_000, failOn: "warning" })
    const info = await input.metadata()
    if (info.format !== "webp" || (info.pages ?? 1) !== 1) throw Error("Only still WebP")
    image = await input.webp({ quality: 90 }).toBuffer()
    if (image.length > 1024 * 1024) throw Error("Too large")
  } catch { throw new HttpError(400, "표지 이미지 형식이나 크기를 확인해 주세요.") }
  return { hash: createHash("sha256").update(bytes).digest("hex"), filename, pages, pdf: bytes, cover: image,
    fields: fields(parsed.fields), evidence: evidence(parsed.evidence, pages), warnings: warnings(parsed.warnings) }
}
