import { coverLimit } from "../admin-cloud/protocol"

type CoverCanvas = Pick<HTMLCanvasElement, "toBlob">

export async function encodePdfCover(canvas: CoverCanvas, signal: AbortSignal): Promise<Blob> {
  // Unsupported encoders silently return PNG. Check the actual MIME type and
  // fall back to JPEG, keeping generation on the device and the same size cap.
  for (const type of ["image/webp", "image/jpeg"]) {
    for (const quality of [0.9, 0.8, 0.65]) {
      signal.throwIfAborted()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
      signal.throwIfAborted()
      if (!blob || blob.type !== type) break
      if (blob.size > 0 && blob.size <= coverLimit) return blob
    }
  }
  throw Error("1 MB 이하 표지를 만들지 못했어요. PDF를 최적화하거나 다른 브라우저에서 다시 시도해 주세요.")
}
