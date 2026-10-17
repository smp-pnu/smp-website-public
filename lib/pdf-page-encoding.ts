const fastImageLimit = 1536 * 1024

// Encoding happens only in the visitor's browser, not on the server. PNG is
// fast and lossless for report text. Photo-heavy pages keep the former WebP
// compression so the existing whole-document memory budget still applies.
export async function encodePdfPageImage(canvas: Pick<HTMLCanvasElement, 'toBlob'>, signal: AbortSignal) {
  const encode = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
    signal.throwIfAborted()
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), type, quality)
  })
  const png = await encode('image/png')
  signal.throwIfAborted()
  if (png.size <= fastImageLimit) return png
  const compact = await encode('image/webp', 0.94)
  signal.throwIfAborted()
  return compact.size < png.size ? compact : png
}
