import { test } from "node:test"
import assert from "node:assert/strict"
import { readApi, peekApi, ApiError } from "../lib/client-api-cache"
import { cachedReportPreview } from "../free/client/report-preview"
import { getPdfSources } from "../lib/pdf-source"
import type { ContentItem } from "../lib/content-model"

test("cached list metadata can render first without caching document access", async t => {
  const originalFetch = globalThis.fetch, originalNow = Date.now
  let now = originalNow(), requests = 0
  Date.now = () => now
  const id = "a0000000000000000000000000000001"
  const path = `/api/detail/research/${id}`
  const item: ContentItem = { id, kind: "research", title: "목록에서 읽은 제목", summary: "목표주가 10,000원",
    date: "2026-10-01", category: "기업분석", author: "R1", pinned: false,
    company: "기업", ticker: "123456", attachments: [{ name: "report.pdf", url: "https://example.com/report.pdf" }],
    externalUrl: "https://drive.google.com/file/d/report/view", investmentPoints: ["본문에만 있는 내용"] }
  const cover={url:`/report-covers/${id}/${'a'.repeat(64)}.webp`,previewUrl:`/report-covers/${id}/${'b'.repeat(64)}.webp`,width:2048,height:2899,reader:{version:1,pageCount:1,pages:[{page:1,url:`/report-covers/${id}/${'b'.repeat(64)}.webp`,width:2048,height:2899}]}}
  const catalog = { state: "ready", items: [{ ...item, cover, blocks: ["본문"] }] }
  let respond: (path: string) => Promise<Response> = async () => Response.json(catalog)
  globalThis.fetch = (async input => { requests++; return respond(String(input)) }) as typeof fetch
  try {
    await t.test("preview is synchronous, projects only list metadata, and adds no fetch", async () => {
      assert.equal(cachedReportPreview(id), undefined)
      assert.equal(requests, 0)
      await readApi("/api/catalog/research", 1000)
      const preview = cachedReportPreview(id)!
      assert.equal(preview.title, item.title)
      assert.equal(preview.summary, item.summary)
      assert.equal(preview.ticker, item.ticker)
      assert.deepEqual(getPdfSources(preview), [])
      assert.deepEqual(preview.cover,{url:cover.url,width:2048,height:2899})
      for (const key of ["blocks", "investmentPoints"]) assert.equal(key in preview, false)
      assert.equal(preview.externalUrl, null)
      assert.deepEqual(preview.attachments, [])
      assert.equal(cachedReportPreview("b".repeat(32)), undefined)
      assert.equal(cachedReportPreview("../notice/other"), undefined)
      assert.equal(requests, 1)
    })

    await t.test("reading previews never prolongs the list cache lifetime", () => {
      now += 999
      assert.ok(cachedReportPreview(id))
      now++
      assert.equal(cachedReportPreview(id), undefined)
      assert.equal(requests, 1)
    })

    await t.test("slow details share one request while metadata remains available", async () => {
      await readApi("/api/catalog/research")
      let finish!: (response: Response) => void
      respond = () => new Promise(resolve => { finish = resolve })
      const before = requests
      const first = readApi<{ item: ContentItem }>(path, 0)
      const second = readApi<{ item: ContentItem }>(path, 0)
      assert.equal(cachedReportPreview(id)?.title, item.title)
      assert.equal(requests, before + 1)
      finish(Response.json({ item: { ...item, title: "최신 공개 제목" }, blocks: [] }))
      const [a, b] = await Promise.all([first, second])
      assert.equal(a.item.title, "최신 공개 제목")
      assert.deepEqual(a, b)
      assert.equal(peekApi(path), undefined, "full detail must not become a stale preview")
    })

    await t.test("withdrawal removes the old catalog and search cache without retrying", async () => {
      for (const status of [404, 403]) {
        respond = async url => Response.json(url === "/api/search" ? { entries: [{ title: item.title }] } : catalog)
        await readApi("/api/catalog/research")
        await readApi("/api/search")
        assert.ok(cachedReportPreview(id))
        const before = requests
        respond = async () => new Response(null, { status })
        await assert.rejects(readApi(path, 0), error => error instanceof ApiError && error.status === status)
        assert.equal(cachedReportPreview(id), undefined)
        assert.equal(peekApi("/api/search"), undefined)
        assert.equal(requests, before + 1)
      }
    })
  } finally {
    globalThis.fetch = originalFetch
    Date.now = originalNow
  }
})
