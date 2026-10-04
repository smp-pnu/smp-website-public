import { afterEach, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { fetchReportCover } from "../lib/report-cover"
import { GET } from "../app/api/content/research/[id]/cover/route"
import { coverStore } from "../lib/cover-store"

const originalFetch = global.fetch
const originalEnv = { ...process.env }
const id = "11111111111141118111111111111111"
const drive = "https://drive.google.com/file/d/abcdefghijk123/view?resourcekey=0-key"
const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const request = new Request("https://smp.test/api/content/research/cover")
const params = Promise.resolve({ id })
beforeEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.BLOB_STORE_ID
  process.env.NOTION_TOKEN = "test-only"
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = "22222222222242228222222222222222"
})

test("storage failure falls back to Drive without a duplicate publication query", async t => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-only"
  t.mock.method(coverStore, "read", async () => { throw new Error("Storage unavailable") })
  let notionCalls = 0
  global.fetch = async input => {
    if (String(input).includes("api.notion.com")) { notionCalls++; return notion() }
    return new Response(imageBytes)
  }
  assert.equal((await GET(request, { params })).status, 200)
  assert.equal(notionCalls, 1)
})
afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv } })

function notion(published = true, pageId = id) {
  return Response.json({ id: pageId, object: "page", parent: { type: "data_source_id", data_source_id: process.env.NOTION_REPORTS_DATA_SOURCE_ID }, properties: {
    "제목": { title: [{ plain_text: "Cover test" }] }, "공개": { checkbox: published },
    "게시일": { date: { start: "2026-01-01" } }, "외부 링크": { url: drive },
  } })
}

test("covers require a currently published report from the configured source", async () => {
  for (const reply of [notion(false), notion(true, "33333333333343338333333333333333")]) {
    let calls = 0
    global.fetch = async () => { calls++; return reply }
    assert.equal((await GET(request, { params })).status, 404)
    assert.equal(calls, 1)
  }
  global.fetch = async () => { throw new Error("No request expected") }
  assert.equal((await GET(request, { params: Promise.resolve({ id: "not-a-page" }) })).status, 404)
})

test("cover images follow trusted Google redirects without leaking cookies or file URLs", async () => {
  global.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === "api.notion.com") return notion()
    assert.equal(init?.headers, undefined)
    assert.equal(init?.redirect, "manual")
    assert.equal(init?.cache, "no-store")
    if (url.hostname === "drive.google.com") {
      assert.equal(url.pathname, "/thumbnail")
      assert.equal(url.searchParams.get("id"), "abcdefghijk123")
      assert.equal(url.searchParams.get("resourcekey"), "0-key")
      return new Response(null, { status: 302, headers: { location: "https://lh3.googleusercontent.com/cover" } })
    }
    return new Response(imageBytes, { headers: { "set-cookie": "never=forward", "content-type": "application/octet-stream" } })
  }
  const result = await GET(request, { params })
  assert.equal(result.status, 200)
  assert.equal(result.headers.get("content-type"), "image/png")
  assert.match(result.headers.get("cache-control")!, /no-store/)
  assert.equal(result.headers.get("set-cookie"), null)
  assert.equal(result.headers.get("location"), null)
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), imageBytes)
})

test("thumbnail HTML and unsafe redirects never become same-origin images", async () => {
  for (const reply of [new Response("<svg onload='alert(1)' />", { headers: { "content-type": "image/png" } }), new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }), new Response(null, { status: 302, headers: { location: "https://lh3.googleusercontent.com.evil.test/cover" } })]) {
    let calls = 0
    global.fetch = async () => { calls++; return reply }
    await assert.rejects(fetchReportCover("https://drive.google.com/thumbnail?id=abcdefghijk123", new AbortController().signal))
    assert.equal(calls, 1)
  }
})

test("cover reads have a bounded size", async () => {
  let cancelled = false
  global.fetch = async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) },
    cancel() { cancelled = true },
  }))
  await assert.rejects(fetchReportCover("https://drive.google.com/thumbnail?id=abcdefghijk123", new AbortController().signal), /too large/)
  assert.equal(cancelled, true)
})

test("simultaneous thumbnail requests share only an in-flight publication lookup", async () => {
  let notionCalls = 0
  global.fetch = async input => {
    if (String(input).includes("api.notion.com")) { notionCalls++; return notion() }
    return new Response(imageBytes)
  }
  const results = await Promise.all([GET(request, { params }), GET(request, { params })])
  assert.ok(results.every(result => result.status === 200))
  assert.equal(notionCalls, 1)
  global.fetch = async () => notion(false)
  assert.equal((await GET(request, { params })).status, 404)
})
