// Local browser verification with a real PDF; never imported by the application.
// SMP_TEST_PDF_PATH / SMP_TEST_COVER_PATH point to local test files.
import "./scale-fixture.mjs"
import { appendFileSync, readFileSync } from "node:fs"
import { setTimeout } from "node:timers/promises"
const fixtureFetch = globalThis.fetch
const pdf = readFileSync(process.env.SMP_TEST_PDF_PATH)
const cover = readFileSync(process.env.SMP_TEST_COVER_PATH)
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  let state = {}
  try { state = JSON.parse(readFileSync(process.env.SMP_TEST_STATE, "utf8")) } catch {}
  if (url.hostname === "drive.google.com" && url.pathname === "/thumbnail") {
    return state.noCover ? new Response(null, { status: 404 }) : new Response(cover, { headers: { "content-type": "image/png" } })
  }
  if (url.hostname !== "drive.usercontent.google.com") return fixtureFetch(input, init)
  const range = new Headers(init?.headers).get("range")
  const match = range && /^bytes=(\d+)-(\d+)$/.exec(range)
  const start = match ? Number(match[1]) : 0, end = match ? Math.min(Number(match[2]), pdf.length - 1) : pdf.length - 1
  if (process.env.SMP_TEST_STATS) appendFileSync(process.env.SMP_TEST_STATS, `${JSON.stringify({ path: "pdf", range, bytes: end - start + 1, total: pdf.length, at: Date.now() })}\n`)
  await setTimeout(state.pdfDelay ?? 1000, undefined, { signal: init?.signal })
  if (state.pdfFail) return new Response(null, { status: 503 })
  let offset = start, cancelled = false
  const body = new ReadableStream({
    async pull(controller) {
      if (cancelled) return
      if (offset > end) { controller.close(); return }
      await setTimeout(state.chunkDelay ?? 100, undefined, { signal: init?.signal })
      if (cancelled) return
      const next = Math.min(offset + 256 * 1024, end + 1)
      controller.enqueue(pdf.subarray(offset, next))
      offset = next
    },
    cancel() { cancelled = true },
  })
  return new Response(body, { status: range ? 206 : 200, headers: {
    "content-type": "application/octet-stream", "content-length": String(end - start + 1), "accept-ranges": "bytes",
    "last-modified": "Mon, 05 Oct 2026 00:00:00 GMT",
    ...(range ? { "content-range": `bytes ${start}-${end}/${pdf.length}` } : {}),
  } })
}
