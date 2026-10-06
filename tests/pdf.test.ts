import { afterEach, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { driveDownloadUrl, getPdfSources, isAllowedPdfUrl } from "../lib/pdf-source"
import { streamPdf } from "../lib/pdf-response"
import { GET } from "../app/api/content/[kind]/[id]/pdf/route"

const originalFetch = global.fetch
const originalEnv = { ...process.env }
const id = "11111111111141118111111111111111"
const drive = "https://drive.google.com/file/d/abcdefghijk123/view"
const pdfBytes = new TextEncoder().encode("%PDF-1.7\nreport bytes")
beforeEach(() => {
  process.env.NOTION_TOKEN = "test-only"
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = "22222222222242228222222222222222"
})
afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv } })

function notionResponse(published = true) {
  return Response.json({ id, object: "page", parent: { type: "data_source_id", data_source_id: process.env.NOTION_REPORTS_DATA_SOURCE_ID }, properties: {
    "제목": { title: [{ plain_text: "테스트 리포트" }] }, "공개": { checkbox: published },
    "게시일": { date: { start: "2026-01-01" } }, "외부 링크": { url: drive },
  } })
}

test("Drive URLs accept individual files and reject folders, lookalikes and credentials", () => {
  assert.equal(driveDownloadUrl(drive), "https://drive.usercontent.google.com/download?id=abcdefghijk123&export=download")
  assert.match(driveDownloadUrl("https://drive.google.com/open?id=abcdefghijk123&resourcekey=0-abc")!, /resourcekey=0-abc/)
  for (const url of ["https://drive.google.com/drive/folders/abcdefghijk123", "https://drive.google.com.evil.test/file/d/abcdefghijk123/view", "https://user:pass@drive.google.com/file/d/abcdefghijk123/view", "http://drive.google.com/file/d/abcdefghijk123/view", "https://127.0.0.1/report.pdf"]) assert.equal(driveDownloadUrl(url), null)
  assert.equal(isAllowedPdfUrl("https://drive.usercontent.google.com.evil.test/download"), false)
  assert.equal(isAllowedPdfUrl("https://s3.us-west-2.amazonaws.com/other-bucket/file.pdf"), false)
})

test("ordinary external links are not turned into proxy requests", () => {
  assert.deepEqual(getPdfSources({ attachments: [{ name: "report.pdf", url: "http://localhost/report.pdf" }], externalUrl: "https://example.org/report.pdf" } as Parameters<typeof getPdfSources>[0]), [])
})

test("PDF endpoint requires a published page in its configured database", async () => {
  let calls = 0
  global.fetch = async () => { calls++; return notionResponse(false) }
  const request = new Request("https://smp.test/api/pdf?source=external")
  assert.equal((await GET(request, { params: Promise.resolve({ kind: "research", id }) })).status, 404)
  global.fetch = async () => { calls++; return notionResponse() }
  assert.equal((await GET(request, { params: Promise.resolve({ kind: "research", id: "33333333333343338333333333333333" }) })).status, 404)
  assert.equal(calls, 2)
  assert.equal((await GET(request, { params: Promise.resolve({ kind: "unknown", id }) })).status, 404)
  assert.equal(calls, 2)
})

test("PDF endpoint streams a fresh source and generates safe Korean download headers", async () => {
  global.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.notion.com/")) return notionResponse()
    assert.equal(init?.cache, "no-store")
    assert.equal(init?.redirect, "manual")
    assert.deepEqual(init?.headers, { "Accept-Encoding": "identity" })
    return new Response(pdfBytes, { headers: { "set-cookie": "secret=never-forward", "content-type": "application/octet-stream" } })
  }
  const result = await GET(new Request("https://smp.test/api/pdf?source=external&download=1"), { params: Promise.resolve({ kind: "research", id }) })
  assert.equal(result.status, 200)
  assert.equal(result.headers.get("content-type"), "application/pdf")
  assert.match(result.headers.get("content-disposition")!, /^attachment;.*filename\*=UTF-8''/)
  assert.match(decodeURIComponent(result.headers.get("content-disposition")!), /테스트 리포트.pdf/)
  assert.equal(result.headers.get("set-cookie"), null)
  assert.equal(result.headers.get("location"), null)
  assert.equal(result.headers.get("content-length"), null)
  assert.match(result.headers.get("cache-control")!, /no-store/)
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), pdfBytes)
})

test("upstream HTML, unavailable files and redirect SSRF are rejected", async () => {
  for (const source of [new Response("<html>Sign in</html>"), new Response(null, { status: 403 }), new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })]) {
    let calls = 0
    global.fetch = async () => { calls++; return source }
    await assert.rejects(streamPdf(driveDownloadUrl(drive)!, "file.pdf", false, new AbortController().signal))
    assert.equal(calls, 1)
  }
})

test("large PDF responses stay streamed and cancellation reaches upstream", async () => {
  let produced = 0
  let cancelled = false
  global.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      produced++
      if (produced === 1) controller.enqueue(pdfBytes)
      else if (produced <= 20) controller.enqueue(new Uint8Array(1024 * 1024))
      else controller.close()
    },
    cancel() { cancelled = true },
  }), { headers: { "content-length": String(pdfBytes.length + 19 * 1024 * 1024), "accept-ranges": "bytes" } })
  const result = await streamPdf(driveDownloadUrl(drive)!, "file.pdf", false, new AbortController().signal)
  assert.ok(produced < 5, "the complete file must not be buffered before returning")
  assert.equal(result.headers.get("content-length"), String(pdfBytes.length + 19 * 1024 * 1024))
  assert.match(result.headers.get("content-disposition")!, /^inline;/)
  const reader = result.body!.getReader()
  assert.deepEqual((await reader.read()).value, pdfBytes)
  await reader.cancel()
  assert.equal(cancelled, true)
})

test("PDF signature detection handles split network chunks and rejects invalid indices", async () => {
  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (const chunk of ["%P", "D", "F-1.7\n"]) controller.enqueue(new TextEncoder().encode(chunk))
    controller.close()
  } }))
  const result = await streamPdf(driveDownloadUrl(drive)!, "file.pdf", false, new AbortController().signal)
  assert.equal(await result.text(), "%PDF-1.7\n")
  global.fetch = async () => notionResponse()
  for (const query of ["index=-1", "index=NaN", "index=99", "url=http://localhost/private"]) {
    assert.equal((await GET(new Request(`https://smp.test/api/pdf?${query}`), { params: Promise.resolve({ kind: "research", id }) })).status, 404)
  }
})

test("published PDF ranges keep authorization, byte offsets and safe headers across redirects", async () => {
  let calls = 0
  global.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.notion.com/")) return notionResponse()
    calls++
    assert.deepEqual(init?.headers, { "Accept-Encoding": "identity", Range: "bytes=10-19" })
    if (calls === 1) return new Response(null, { status: 302, headers: { location: "https://drive.usercontent.google.com/download?id=redirected" } })
    return new Response(pdfBytes.slice(10, 20), { status: 206, headers: {
      "content-range": `bytes 10-19/${pdfBytes.length}`, "content-length": "10", "accept-ranges": "bytes",
      "content-type": "application/octet-stream", "set-cookie": "never-forward", "last-modified": "Mon, 05 Oct 2026 00:00:00 GMT",
    } })
  }
  const request = new Request("https://smp.test/api/pdf?source=external", { headers: { Range: "bytes=10-19" } })
  const result = await GET(request, { params: Promise.resolve({ kind: "research", id }) })
  assert.equal(result.status, 206)
  assert.equal(result.headers.get("content-range"), `bytes 10-19/${pdfBytes.length}`)
  assert.equal(result.headers.get("content-length"), "10")
  assert.equal(result.headers.get("accept-ranges"), "bytes")
  assert.equal(result.headers.get("last-modified"), "Mon, 05 Oct 2026 00:00:00 GMT")
  assert.equal(result.headers.get("set-cookie"), null)
  assert.match(result.headers.get("cache-control")!, /no-store/)
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), pdfBytes.slice(10, 20))
  assert.equal(calls, 2)
  global.fetch = async () => notionResponse(false)
  assert.equal((await GET(request, { params: Promise.resolve({ kind: "research", id }) })).status, 404)
})

test("initial ranges validate PDF signatures and clamp to the final byte", async () => {
  global.fetch = async () => new Response(pdfBytes, { status: 206, headers: {
    "content-range": `bytes 0-${pdfBytes.length - 1}/${pdfBytes.length}`, "content-type": "application/pdf",
  } })
  const result = await streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, "bytes=0-999")
  assert.equal(result.status, 206)
  assert.equal(result.headers.get("content-length"), String(pdfBytes.length))
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), pdfBytes)
  global.fetch = async () => new Response("<html>", { status: 206, headers: { "content-range": "bytes 0-5/6", "content-type": "application/pdf" } })
  await assert.rejects(streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, "bytes=0-999"))
})

test("malformed or inconsistent partial responses are rejected before serving bytes", async () => {
  const valid = { "content-range": "bytes 10-19/100", "content-length": "10", "content-type": "application/pdf" }
  const invalidHeaders: Record<string, string>[] = [
    { "content-range": "bytes 9-18/100" }, { "content-range": "bytes 10-18/100" },
    { "content-range": "bytes 10-19/19" }, { "content-range": "bytes 10-19/*" },
    { "content-length": "9" }, { "content-type": "text/html" }, { "content-encoding": "gzip" },
  ]
  for (const invalid of invalidHeaders) {
    global.fetch = async () => new Response(new Uint8Array(10), { status: 206, headers: { ...valid, ...invalid } })
    await assert.rejects(streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, "bytes=10-19"))
  }
  global.fetch = async () => new Response(new Uint8Array(10), { status: 206, headers: valid })
  await assert.rejects(streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal))
})

test("range requests fall back to validated full responses and preserve file length", async () => {
  global.fetch = async () => new Response(pdfBytes, { headers: { "content-length": String(pdfBytes.length), "accept-ranges": "bytes" } })
  const result = await streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, "bytes=0-999")
  assert.equal(result.status, 200)
  assert.equal(result.headers.get("content-length"), String(pdfBytes.length))
  assert.equal(result.headers.get("content-range"), null)
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), pdfBytes)
})

test("unsupported and unsatisfiable ranges do not turn into full downloads", async () => {
  let calls = 0
  global.fetch = async () => { calls++; return new Response(null, { status: 416, headers: { "content-range": "bytes */100" } }) }
  for (const range of ["bytes=0-9,20-29", "bytes=-", "bytes=-0", "bytes=20-10", "bytes=0-9007199254740992"]) {
    const result = await streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, range)
    assert.equal(result.status, 416)
  }
  assert.equal(calls, 0)
  const result = await streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, "bytes=100-200")
  assert.equal(result.status, 416)
  assert.equal(result.headers.get("content-range"), "bytes */100")
  assert.equal(calls, 1)
})

test("open and suffix ranges remain compatible with native readers and resumed downloads", async () => {
  global.fetch = async () => new Response(pdfBytes.slice(-10), { status: 206, headers: {
    "content-type": "application/pdf", "content-range": `bytes ${pdfBytes.length - 10}-${pdfBytes.length - 1}/${pdfBytes.length}`,
  } })
  for (const range of ["bytes=-10", `bytes=${pdfBytes.length - 10}-`]) {
    const result = await streamPdf(driveDownloadUrl(drive)!, "file", false, new AbortController().signal, range)
    assert.equal(result.status, 206)
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), pdfBytes.slice(-10))
  }
})
