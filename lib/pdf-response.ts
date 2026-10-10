import "server-only"
import { upstreamFetch } from "@/lib/upstream-fetch"
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
    upstream = await upstreamFetch(url, { cache: "no-store", redirect: "manual", signal,
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
  const prefix: Uint8Array<ArrayBuffer>[] = []
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

  reader.releaseLock()
  let body = upstream.body
  if (prefix.length) {
    // Validate only the prefix in JavaScript. Native stream piping forwards
    // the remaining bytes without a JS callback for every PDF chunk.
    // Workers' IdentityTransformStream keeps large passthrough responses in
    // native code. A standards-based TransformStream can execute JS per chunk.
    const NativeIdentity = (globalThis as unknown as {
      IdentityTransformStream?: new () => {readable:ReadableStream<Uint8Array<ArrayBuffer>>;writable:WritableStream<Uint8Array<ArrayBuffer>>}
    }).IdentityTransformStream
    const stream = NativeIdentity ? new NativeIdentity() : new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>()
    const writer = stream.writable.getWriter()
    const source = upstream.body
    const forward = async () => {
      try { for (const chunk of prefix) await writer.write(chunk) }
      finally { writer.releaseLock() }
      await source.pipeTo(stream.writable)
    }
    void forward().catch(() => {
      // pipeTo propagates errors/cancellation to the response stream. If the
      // client left during the prefix, also stop the not-yet-piped source.
      if (!source.locked) void source.cancel().catch(() => {})
    })
    body = stream.readable
  }
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
