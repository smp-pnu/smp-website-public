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
  return Response.json({ has_more: false, results: [{ id, object: "page", properties: {
    "제목": { title: [{ plain_text: "테스트 리포트" }] }, "공개": { checkbox: published },
    "게시일": { date: { start: "2026-01-01" } }, "외부 링크": { url: drive },
  } }] })
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
    assert.equal(init?.headers, undefined)
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
  }))
  const result = await streamPdf(driveDownloadUrl(drive)!, "file.pdf", false, new AbortController().signal)
  assert.ok(produced < 5, "the complete file must not be buffered before returning")
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
