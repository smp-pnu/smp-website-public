import "server-only"
import { isAllowedPdfUrl } from "./pdf-source"

export const pdfHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
}

export async function streamPdf(url: string, name: string, download: boolean, signal: AbortSignal) {
  let upstream: Response | undefined
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isAllowedPdfUrl(url)) throw new Error("Unsupported PDF source")
    upstream = await fetch(url, { cache: "no-store", redirect: "manual", signal })
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break
    await upstream.body?.cancel()
    const location = upstream.headers.get("location")
    if (!location || redirects === 3) throw new Error("Unsupported PDF redirect")
    url = new URL(location, url).href
  }
  if (!upstream?.ok || !upstream.body) {
    await upstream?.body?.cancel()
    throw new Error("PDF unavailable")
  }

  // Drive may return an HTML login, quota or virus-scan page with HTTP 200.
  // Validate the signature before serving anything from our own origin.
  const reader = upstream.body.getReader()
  const prefix: Uint8Array[] = []
  let length = 0
  while (length < 5) {
    const chunk = await reader.read()
    if (chunk.done) break
    prefix.push(chunk.value)
    length += chunk.value.length
  }
  const signature = prefix.flatMap(chunk => Array.from(chunk.subarray(0, 5))).slice(0, 5)
  if (String.fromCharCode(...signature) !== "%PDF-") {
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
  // No Content-Length: send chunks as received, including PDFs over Vercel's
  // buffered response limit. Never forward upstream cookies or account headers.
  return new Response(body, { headers: {
    ...pdfHeaders,
    "Content-Type": "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="report.pdf"; filename*=UTF-8''${encoded}`,
    "Content-Security-Policy": "sandbox",
  } })
}
