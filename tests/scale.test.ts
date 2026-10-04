import { test } from "node:test"
import assert from "node:assert/strict"
import { coverBatch } from "../lib/cover-schedule"
import { getContentBlocks, loadContent, loadContentItem } from "../lib/notion"
import { notionRequest, NotionRequestError } from "../lib/notion-request"
import type { ContentItem } from "../lib/content-model"

test("600 reports paginate once for 100 overlapping reads", async () => {
  const oldFetch = global.fetch, env = { ...process.env }
  let calls = 0
  process.env.NOTION_TOKEN = "scale-test"
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = "33333333333343338333333333333333"
  try {
    global.fetch = async (_url, init) => {
      calls++
      await new Promise(resolve => setTimeout(resolve, 2))
      const start = Number(JSON.parse(String(init?.body)).start_cursor ?? 0)
      return Response.json({ results: Array.from({ length: 100 }, (_, offset) => ({
        object: "page", id: (start + offset + 1).toString(16).padStart(32, "0"),
        properties: { "공개": { checkbox: true }, "게시일": { date: { start: "2026-01-01" } },
          "제목": { title: [{ plain_text: `리포트 ${start + offset + 1}` }] } },
      })), has_more: start < 500, next_cursor: start < 500 ? String(start + 100) : null })
    }
    const results = await Promise.all(Array.from({ length: 100 }, () => loadContent("research")))
    assert.ok(results.every(result => result.state === "ready" && result.items.length === 600))
    assert.equal(calls, 6)
  } finally { global.fetch = oldFetch; process.env = env }
})

test("direct page reads reject another database, child pages, and a missing parent", async () => {
  const oldFetch = global.fetch, env = { ...process.env }
  const id = "11111111111141118111111111111111"
  process.env.NOTION_TOKEN = "scope-test"
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = "33333333333343338333333333333333"
  try {
    for (const parent of [undefined, { type: "page_id", page_id: process.env.NOTION_REPORTS_DATA_SOURCE_ID },
      { type: "data_source_id", data_source_id: "22222222222242228222222222222222" }]) {
      global.fetch = async () => Response.json({ id, object: "page", parent,
        properties: { "공개": { checkbox: true }, "게시일": { date: { start: "2026-01-01" } }, "제목": { title: [{ plain_text: "Private" }] } } })
      assert.equal(await loadContentItem("research", id), null)
    }
  } finally { global.fetch = oldFetch; process.env = env }
})

test("daily cover checks are bounded and visit all 600 reports over 30 days", () => {
  const items = Array.from({ length: 600 }, (_, i) => ({ id: String(i).padStart(32, "0") }) as ContentItem)
  const visited = new Set<string>()
  for (let day = 0; day < 30; day++) {
    const batch = coverBatch(items, day * 86_400_000)
    assert.equal(batch.length, 20)
    batch.forEach(item => visited.add(item.id))
  }
  assert.equal(visited.size, 600)
  assert.equal(coverBatch([]).length, 0)
  assert.equal(coverBatch(items.slice(0, 5)).length, 5)
})

test("long Notion throttles fail without retrying earlier than Retry-After", async () => {
  const oldFetch = global.fetch
  let calls = 0
  try {
    global.fetch = async () => { calls++; return new Response(null, { status: 429, headers: { "retry-after": "60" } }) }
    await assert.rejects(notionRequest("pages/test"), (error: unknown) => error instanceof NotionRequestError && error.retryAfter === 60)
    await assert.rejects(notionRequest("pages/another"), NotionRequestError)
    assert.equal(calls, 1)
  } finally { global.fetch = oldFetch }
})

test("100 overlapping uncached body reads share one block query", async () => {
  const oldFetch = global.fetch, token = process.env.NOTION_TOKEN
  process.env.NOTION_TOKEN = "body-test"
  let calls = 0
  try {
    global.fetch = async () => {
      calls++
      await new Promise(resolve => setTimeout(resolve, 10))
      return Response.json({ results: [{ id: "body", type: "paragraph" }], has_more: false, next_cursor: null })
    }
    const results = await Promise.all(Array.from({ length: 100 }, () => getContentBlocks("test-page")))
    assert.equal(calls, 1)
    assert.ok(results.every(blocks => blocks.length === 1))
  } finally { global.fetch = oldFetch; if (token) process.env.NOTION_TOKEN = token; else delete process.env.NOTION_TOKEN }
})

test("a throttle on the final retry also blocks subsequent requests", async () => {
  const oldFetch = global.fetch, token = process.env.NOTION_TOKEN
  process.env.NOTION_TOKEN = "final-retry-test"
  let calls = 0
  try {
    global.fetch = async () => {
      calls++
      return new Response(null, { status: calls < 3 ? 503 : 429, headers: { "retry-after": calls < 3 ? "1" : "60" } })
    }
    await assert.rejects(notionRequest("pages/test"), (error: unknown) => error instanceof NotionRequestError && error.retryAfter === 60)
    await assert.rejects(notionRequest("pages/another"), NotionRequestError)
    assert.equal(calls, 3)
  } finally { global.fetch = oldFetch; if (token) process.env.NOTION_TOKEN = token; else delete process.env.NOTION_TOKEN }
})
