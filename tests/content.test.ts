import { afterEach, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { normalizeId, safeUrl, sortContent, toContentItem, type NotionPage } from "../lib/content-model"
import { getContent, getContentBlocks, getContentItem, loadContent } from "../lib/notion"
import { GET } from "../app/api/content/[kind]/[id]/file/route"

const id = "11111111-1111-4111-8111-111111111111"
const notices = "22222222222242228222222222222222"
const reports = "33333333333343338333333333333333"
function page(overrides: Partial<NotionPage> = {}): NotionPage {
  return { object: "page", id, created_time: "2026-01-01T00:00:00Z", properties: {
    "제목": { type: "title", title: [{ plain_text: "공개 공지" }] },
    "공개": { type: "checkbox", checkbox: true },
    "게시일": { type: "date", date: { start: "2026-01-01" } },
    "첨부파일": { type: "files", files: [{ name: "report.pdf", type: "file", file: { url: "https://example.com/report.pdf?signature=fresh" } }] },
  }, ...overrides }
}
const originalFetch = global.fetch
const originalEnv = { ...process.env }
beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-never-use-in-production"
  process.env.NOTION_NOTICES_DATA_SOURCE_ID = notices
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = reports
})
afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv } })
function response(results: unknown[], has_more = false, next_cursor: string | null = null) {
  return Response.json({ results, has_more, next_cursor })
}

test("only explicit published, dated, current pages are visible", () => {
  const base = page()
  const now = Date.parse("2026-01-01T00:00:00Z")
  assert.ok(toContentItem(base, "notice", now))
  for (const modified of [
    { ...base, archived: true }, { ...base, in_trash: true },
    { ...base, properties: { ...base.properties, "공개": { type: "checkbox", checkbox: false } } },
    { ...base, properties: { ...base.properties, "공개": { type: "checkbox" } } },
    { ...base, properties: { ...base.properties, "게시일": { type: "date", date: null } } },
    { ...base, properties: { ...base.properties, "게시일": { type: "date", date: { start: "2099-01-01" } } } },
    { ...base, properties: { ...base.properties, "제목": { type: "title", title: [] } } },
  ]) assert.equal(toContentItem(modified, "notice", now), null)
})

test("date-only publications start at Korea midnight", () => {
  assert.equal(toContentItem(page(), "notice", Date.parse("2025-12-31T14:59:59Z")), null)
  assert.ok(toContentItem(page(), "notice", Date.parse("2025-12-31T15:00:00Z")))
})

test("unsafe links and malformed IDs are rejected", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "//example.com", "https://user:pass@example.com"]) assert.equal(safeUrl(url), null)
  assert.equal(safeUrl("https://example.com/report.pdf"), "https://example.com/report.pdf")
  assert.equal(normalizeId("../secrets"), null)
  assert.equal(normalizeId(id), id.replaceAll("-", ""))
})

test("pinned notices appear first, followed by newest publications", () => {
  const item = toContentItem(page(), "notice")!
  const sorted = sortContent([{ ...item, id: "recent", date: "2026-02-01" }, { ...item, id: "old", date: "2025-01-01" }, { ...item, id: "pinned", pinned: true }])
  assert.deepEqual(sorted.map(item => item.id), ["pinned", "recent", "old"])
})

test("same-day reports use natural title order while newer dates stay first", () => {
  const item = toContentItem(page(), "research")!
  const reports = [4, 2, 10, 1].map(number => ({ ...item, id: String(20 - number), title: `2026-2 첫세션 R${number} 리포트` }))
  const sorted = sortContent([...reports, { ...item, id: "newer", title: "R9 새 리포트", date: "2026-02-01" }])
  assert.deepEqual(sorted.map(item => item.title), ["R9 새 리포트", "2026-2 첫세션 R1 리포트", "2026-2 첫세션 R2 리포트", "2026-2 첫세션 R4 리포트", "2026-2 첫세션 R10 리포트"])
})

test("Notion display order wins over dates and survives filtering without mutating the input", () => {
  const base = page()
  const pages = [
    { id: "11111111111141118111111111111111", order: 3, date: "2026-02-01", color: "red" },
    { id: "22222222222242228222222222222222", order: null, date: "2026-03-01", color: "yellow" },
    { id: "33333333333343338333333333333333", order: 0, date: "2026-01-01", color: "green" },
    { id: "44444444444444448444444444444444", order: 1.5, date: "2026-01-01", color: "blue" },
  ].map(({ id, order, date, color }) => toContentItem({ ...base, id, properties: {
    ...base.properties, "표시 순서": { type: "number", number: order },
    "게시일": { type: "date", date: { start: date } },
    "분류": { type: "select", select: { name: "분석", color } },
  } }, "research")!)
  assert.deepEqual(sortContent(pages).map(item => item.displayOrder), [0, 1.5, 3, undefined])
  assert.deepEqual(sortContent(pages.filter(item => item.displayOrder !== 1.5)).map(item => item.categoryColor), ["green", "red", "yellow"])
  assert.deepEqual(pages.map(item => item.displayOrder), [3, undefined, 0, 1.5])
  assert.equal(toContentItem({ ...base, properties: { ...base.properties, "표시 순서": { type: "number", number: NaN } } }, "research")?.displayOrder, undefined)
})

test("simultaneous list and detail reads share a query, but later requests see publication changes", async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  global.fetch = async () => { calls++; await gate; return response([page()]) }
  const pending = Promise.all([loadContent("research"), getContent("research"), getContentItem("research", id)])
  assert.equal(calls, 1)
  release()
  const results = await pending
  assert.equal(results[0].items.length, 1)
  assert.ok(results[2])
  global.fetch = async () => { calls++; return response([]) }
  assert.equal(await getContentItem("research", id), null)
  assert.equal(calls, 2)
})

test("queries all pages, filters publication, and uses the correct source", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  global.fetch = async (url, init) => {
    assert.equal(init?.cache, "no-store")
    assert.equal((init?.headers as Record<string, string>)["Notion-Version"], "2025-09-03")
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return calls.length === 1 ? response([page()], true, "next-page") : response([page({ id: "44444444-4444-4444-8444-444444444444" })])
  }
  const result = await getContent("research")
  assert.equal(result.state, "ready")
  assert.equal(result.items.length, 2)
  assert.ok(calls.every(call => call.url === `https://api.notion.com/v1/data_sources/${reports}/query`))
  assert.deepEqual(calls[0].body.filter, { property: "공개", checkbox: { equals: true } })
  assert.equal(calls[1].body.start_cursor, "next-page")
})

test("missing config is distinct from API failure and does not request data", async () => {
  delete process.env.NOTION_TOKEN
  global.fetch = async () => { throw new Error("Unexpected request") }
  assert.deepEqual(await getContent("notice"), { items: [], state: "unconfigured" })
  process.env.NOTION_TOKEN = "test-token"
  global.fetch = async () => new Response("Do not log this body", { status: 401 })
  assert.deepEqual(await getContent("notice"), { items: [], state: "error" })
})

test("detail lookup cannot read drafts or pages outside the configured source", async () => {
  global.fetch = async () => response([page({ properties: { ...page().properties, "공개": { type: "checkbox", checkbox: false } } })])
  assert.equal(await getContentItem("notice", id), null)
  assert.equal(await getContentItem("notice", "55555555-5555-4555-8555-555555555555"), null)
})

test("file route refreshes signed links and rejects unpublished files and bad indices", async () => {
  global.fetch = async () => response([page()])
  const params = Promise.resolve({ kind: "notice", id })
  const result = await GET(new Request("https://smp.test/api/file?index=0"), { params })
  assert.equal(result.status, 307)
  assert.match(result.headers.get("location")!, /signature=fresh/)
  assert.match(result.headers.get("cache-control")!, /no-store/)
  assert.equal((await GET(new Request("https://smp.test/api/file?index=-1"), { params })).status, 404)
  global.fetch = async () => response([])
  assert.equal((await GET(new Request("https://smp.test/api/file?index=0"), { params })).status, 404)
})

test("nested blocks paginate without traversing linked databases or child pages", async () => {
  const calls: string[] = []
  global.fetch = async url => {
    calls.push(String(url))
    if (String(url).includes("/child/")) return response([{ id: "nested", type: "paragraph", paragraph: { rich_text: [] } }])
    if (String(url).includes("start_cursor")) return response([{ id: "last", type: "paragraph" }])
    return response([{ id: "child", type: "toggle", has_children: true }, { id: "private-db", type: "child_database", has_children: true }], true, "cursor")
  }
  const blocks = await getContentBlocks(id)
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0].children?.[0].id, "nested")
  assert.equal(calls.length, 3)
  assert.ok(calls.every(url => !url.includes("/private-db/")))
})

test("temporary Notion rate limiting retries successfully", async () => {
  let calls = 0
  global.fetch = async () => ++calls === 1 ? new Response(null, { status: 429, headers: { "retry-after": "1" } }) : response([page()])
  assert.equal((await getContent("notice")).items.length, 1)
  assert.equal(calls, 2)
})

test("repeated Notion cursors stop list and block reads without returning partial content", async () => {
  for (const kind of ["list", "blocks"]) {
    let calls = 0
    global.fetch = async () => {
      if (++calls > 2) throw new Error("Repeated cursor was not stopped")
      return response(kind === "list" ? [page()] : [{ id: "block", type: "paragraph" }], true, "same-cursor")
    }
    if (kind === "list") assert.deepEqual(await loadContent("notice"), { items: [], state: "error" })
    else await assert.rejects(getContentBlocks(id), /Invalid Notion pagination/)
    assert.equal(calls, 2)
  }
})

test("a missing next cursor fails rather than silently dropping the rest of a page", async () => {
  global.fetch = async () => response([page()], true, null)
  assert.deepEqual(await loadContent("notice"), { items: [], state: "error" })
  await assert.rejects(getContentBlocks(id), /Invalid Notion pagination/)
})
