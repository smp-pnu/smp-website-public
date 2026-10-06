import "server-only"
import { isAllowedPdfUrl } from "./pdf-source"
import { parsePdfContentRange, parsePdfRange, resolvePdfRange } from "./pdf-range"

export const pdfHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
}

export async function streamPdf(url: string, name: string, download: boolean, signal: AbortSignal, rangeHeader?: string | null) {
  const requested = rangeHeader ? parsePdfRange(rangeHeader) : null
  if (rangeHeader && !requested) return new Response("Unsupported range", { status: 416, headers: pdfHeaders })
  let upstream: Response | undefined
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isAllowedPdfUrl(url)) throw new Error("Unsupported PDF source")
    upstream = await fetch(url, { cache: "no-store", redirect: "manual", signal,
      headers: { "Accept-Encoding": "identity", ...(requested ? { Range: rangeHeader! } : {}) },
    })
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break
    await upstream.body?.cancel()
    const location = upstream.headers.get("location")
    if (!location || redirects === 3) throw new Error("Unsupported PDF redirect")
    url = new URL(location, url).href
  }
  if (upstream?.status === 416 && requested) {
    await upstream.body?.cancel()
    const contentRange = upstream.headers.get("content-range")
    return new Response(null, { status: 416, headers: { ...pdfHeaders,
      ...(contentRange && /^bytes \*\/\d+$/.test(contentRange) ? { "Content-Range": contentRange } : {}),
    } })
  }
  if (!upstream?.ok || !upstream.body || ![200, 206].includes(upstream.status)) {
    await upstream?.body?.cancel()
    throw new Error("PDF unavailable")
  }

  const partial = upstream.status === 206
  const contentRange = parsePdfContentRange(upstream.headers.get("content-range"))
  const expectedRange = requested && contentRange ? resolvePdfRange(requested, contentRange.total) : null
  const identity = !upstream.headers.get("content-encoding") || upstream.headers.get("content-encoding") === "identity"
  const mime = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
  if (partial && (!requested || !contentRange || !identity
    || contentRange.start !== expectedRange?.start || contentRange.end !== expectedRange?.end
    || !["application/pdf", "application/octet-stream"].includes(mime ?? ""))) {
    await upstream.body.cancel()
    throw new Error("Invalid PDF range response")
  }
  const rawLength = upstream.headers.get("content-length")
  const declaredLength = rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : NaN
  const contentLength = partial ? contentRange!.end - contentRange!.start + 1
    : identity && Number.isSafeInteger(declaredLength) && declaredLength > 0 ? declaredLength : undefined
  if (partial && rawLength && declaredLength !== contentLength) {
    await upstream.body.cancel()
    throw new Error("Invalid PDF range length")
  }

  // Drive may return an HTML login, quota or virus-scan page with HTTP 200.
  // Validate the signature before serving anything from our own origin.
  const reader = upstream.body.getReader()
  const prefix: Uint8Array[] = []
  let length = 0
  // A range in the middle of a PDF cannot contain its header. Such responses
  // require a validated 206 range and binary MIME type from the allowlisted host.
  const checkSignature = !partial || (contentRange!.start === 0 && contentLength! >= 5)
  while (checkSignature && length < 5) {
    const chunk = await reader.read()
    if (chunk.done) break
    prefix.push(chunk.value)
    length += chunk.value.length
  }
  const signature = prefix.flatMap(chunk => Array.from(chunk.subarray(0, 5))).slice(0, 5)
  if (checkSignature && String.fromCharCode(...signature) !== "%PDF-") {
    await reader.cancel()
    throw new Error("Source is not a PDF")
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (prefix.length) { controller.enqueue(prefix.shift()!); return }
      try {
        const { done, value } = await reader.read()
        if (done) { reader.releaseLock(); controller.close() }
        else controller.enqueue(value)
      } catch (error) { controller.error(error) }
    },
    cancel(reason) { return reader.cancel(reason) },
  })
  const filename = name.normalize("NFC").replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 150)
  const encoded = encodeURIComponent(/\.pdf$/i.test(filename) ? filename : `${filename}.pdf`).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  // Keep the body streamed, including large downloads. Forward only the size
  // and range metadata the reader needs; never upstream cookies/account headers.
  return new Response(body, { status: partial ? 206 : 200, headers: {
    ...pdfHeaders,
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="report.pdf"; filename*=UTF-8''${encoded}`,
    "Content-Security-Policy": "sandbox",
    ...(contentLength !== undefined ? { "Content-Length": String(contentLength) } : {}),
    ...(partial ? { "Content-Range": `bytes ${contentRange!.start}-${contentRange!.end}/${contentRange!.total}` } : {}),
    ...(identity && upstream.headers.get("accept-ranges") === "bytes" ? { "Accept-Ranges": "bytes" } : {}),
    ...(upstream.headers.get("last-modified") ? { "Last-Modified": upstream.headers.get("last-modified")! } : {}),
  } })
}
