import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { applyResearchOrder, orderKey, orderPath, readResearchOrder, reportIdsFromBlocks, saveResearchOrder, type OrderBlock } from "../lib/research-order"
import { applySavedResearchOrder, readOrderPageIds } from "../lib/research-order-service"
import { coverStore, type CoverStore, type StoredValue } from "../lib/cover-store"
import { loadContent } from "../lib/notion"
import { POST as adminSync } from "../app/api/admin/research-order/route"
import { POST as webhook } from "../app/api/notion/webhook/route"
import { createHmac } from "node:crypto"
import type { ContentItem } from "../lib/content-model"

const pageId = "aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa"
const a = "11111111111141118111111111111111"
const b = "22222222222242228222222222222222"
const c = "33333333333343338333333333333333"
const numbered = (id: string): OrderBlock => ({ type: "numbered_list_item", numbered_list_item: { rich_text: [{ type: "mention", mention: { type: "page", page: { id } } }] } })
const link = (url: string): OrderBlock => ({ type: "numbered_list_item", numbered_list_item: { rich_text: [{ text: { link: { url } } }] } })
const item = (id: string): ContentItem => ({ id, kind: "research", title: id, summary: "", date: "2026-01-01", category: "", author: "", pinned: false, attachments: [], externalUrl: null })
class MemoryStore implements CoverStore {
  values = new Map<string, StoredValue>()
  writes = 0
  async read(path: string) { return this.values.get(path) ?? null }
  async version(path: string) { return this.values.get(path)?.etag }
  async write(path: string, bytes: Uint8Array, _type: string, options: { etag?: string } = {}) {
    if (this.values.get(path)?.etag !== options.etag) throw new Error("Precondition failed")
    this.values.set(path, { bytes, etag: String(++this.writes) })
    return `https://test.public.blob.vercel-storage.com/${path}`
  }
  async remove() {}
  async paths() { return [] }
}
const originalFetch = global.fetch
const originalEnv = { ...process.env }
const originalRead = coverStore.read
const originalWrite = coverStore.write
const originalVersion = coverStore.version
afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv }; coverStore.read = originalRead; coverStore.write = originalWrite; coverStore.version = originalVersion })

test("flat report references accept mentions and Notion page links, ignore external URLs, instructions, nested and duplicate references", () => {
  assert.deepEqual(reportIdsFromBlocks([
    numbered(a), link(`https://app.notion.com/p/report-${b}?v=${c}#${c}`),
    link(`https://www.notion.so/${c.match(/.{1,8}/g)!.join("")}`), numbered(a),
    link(`https://evil.test/${pageId}`), link(`https://notion.com.evil.test/${pageId}`),
    { ...numbered(pageId), archived: true },
    { type: "toggle", children: [numbered(pageId)] },
    { type: "paragraph", paragraph: { rich_text: [{ text: { content: pageId } }] } },
  ]), [a, b, c])
  assert.deepEqual(reportIdsFromBlocks([link("https://notion.so/11111111-1111-4111-8111-111111111111")]), [a])
  assert.deepEqual(reportIdsFromBlocks([{ type: "link_to_page", link_to_page: { type: "page_id", page_id: b } }]), [b])
})

test("snapshot only reorders currently published reports and appends missing entries without hiding them", async () => {
  const store = new MemoryStore()
  const { order } = await saveResearchOrder(store, pageId, async () => [b, pageId, a])
  assert.deepEqual(applyResearchOrder([item(a), item(c), item(b)], order).map(x => x.id), [b, a, c])
  assert.deepEqual(applyResearchOrder([item(a), item(c)], order).map(x => x.id), [a, c])
  const persisted = Buffer.from(store.values.get(orderPath(pageId))!.bytes).toString()
  for (const id of [a, b, pageId]) assert.ok(!persisted.includes(id))
})

test("duplicate events do not rewrite snapshots and source failures preserve the saved order", async () => {
  const store = new MemoryStore()
  await saveResearchOrder(store, pageId, async () => [a, b])
  assert.equal((await saveResearchOrder(store, pageId, async () => [a, b])).changed, false)
  assert.equal(store.writes, 1)
  await assert.rejects(saveResearchOrder(store, pageId, async () => { throw new Error("Notion down") }))
  assert.deepEqual((await readResearchOrder(store, pageId)).order!.keys, [orderKey(a), orderKey(b)])
})

test("a delayed concurrent event re-fetches Notion after losing the conditional write", async () => {
  const store = new MemoryStore()
  await saveResearchOrder(store, pageId, async () => [a, b])
  let release!: () => void
  let entered!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  let reads = 0
  const slow = saveResearchOrder(store, pageId, async () => {
    if (++reads === 1) { entered(); await gate; return [b, a] }
    return [c, a, b]
  })
  await waiting
  await saveResearchOrder(store, pageId, async () => [c, a, b])
  release()
  await slow
  assert.equal(reads, 2)
  assert.deepEqual((await readResearchOrder(store, pageId)).order!.keys, [c, a, b].map(orderKey))
})

test("restoring an earlier order succeeds even while the public CDN still serves that old snapshot", async () => {
  const store = new MemoryStore()
  await saveResearchOrder(store, pageId, async () => [a, b])
  const stale = await store.read(orderPath(pageId))
  await saveResearchOrder(store, pageId, async () => [b, a])
  store.read = async () => stale
  const restored = await saveResearchOrder(store, pageId, async () => [a, b])
  assert.equal(restored.changed, true)
  assert.equal(store.writes, 3)
  const latest = JSON.parse(Buffer.from(store.values.get(orderPath(pageId))!.bytes).toString())
  assert.deepEqual(latest.keys, [a, b].map(orderKey))
})

test("ordering page pagination is shallow and archived sources fail closed", async () => {
  const calls: string[] = []
  global.fetch = async input => {
    const url = String(input); calls.push(url)
    if (url.includes("/pages/")) return Response.json({ archived: false })
    return url.includes("start_cursor=next")
      ? Response.json({ results: [numbered(b)], has_more: false })
      : Response.json({ results: [{ ...numbered(a), has_children: true }], has_more: true, next_cursor: "next" })
  }
  assert.deepEqual(await readOrderPageIds(pageId), [a, b])
  assert.equal(calls.length, 3)
  global.fetch = async () => Response.json({ archived: true })
  await assert.rejects(readOrderPageIds(pageId), /archived/)
})

test("corrupt snapshots and oversized lists cannot replace a saved order; storage failure keeps the report list available", async () => {
  const store = new MemoryStore()
  await saveResearchOrder(store, pageId, async () => [a])
  const many = Array.from({ length: 251 }, (_, index) => index.toString(16).padStart(32, "0"))
  await assert.rejects(saveResearchOrder(store, pageId, async () => many), /250/)
  assert.equal(store.writes, 1)
  store.values.set(orderPath(pageId), { bytes: Buffer.from('{"version":1,"keys":["bad"]}'), etag: "broken" })
  await assert.rejects(readResearchOrder(store, pageId), /Invalid research order/)
  process.env.NOTION_REPORT_ORDER_PAGE_ID = c
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob"
  coverStore.read = async () => { throw new Error("Blob unavailable") }
  const items = [item(b), item(a)]
  assert.deepEqual(await applySavedResearchOrder(items), items)
})

test("visitor requests share the saved snapshot, never query order blocks and still check publication changes", async () => {
  process.env.NOTION_REPORT_ORDER_PAGE_ID = pageId
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob"
  process.env.NOTION_TOKEN = "test-notion"
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = c
  const store = new MemoryStore()
  await saveResearchOrder(store, pageId, async () => [b, a])
  let blobReads = 0, queries = 0, published = true
  coverStore.read = async path => { blobReads++; return store.read(path) }
  global.fetch = async input => {
    assert.ok(String(input).includes(`/data_sources/${c}/query`))
    queries++
    return Response.json({ results: published ? [{ object: "page", id: a, created_time: "2026-01-01", properties: {
      "제목": { type: "title", title: [{ plain_text: "A" }] }, "공개": { type: "checkbox", checkbox: true }, "게시일": { type: "date", date: { start: "2026-01-01" } },
    } }] : [], has_more: false })
  }
  await Promise.all([applySavedResearchOrder([item(a), item(b)]), applySavedResearchOrder([item(a), item(b)])])
  assert.equal(blobReads, 1)
  assert.deepEqual((await applySavedResearchOrder([item(a), item(b)])).map(x => x.id), [b, a])
  assert.equal(blobReads, 1)
  assert.equal((await loadContent("research")).items.length, 1)
  published = false
  assert.equal((await loadContent("research")).items.length, 0)
  assert.equal(queries, 2)
})

test("order writes require admin authentication or a signed webhook for the configured page", async () => {
  process.env.CRON_SECRET = "s".repeat(40)
  process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = "webhook-token"
  process.env.NOTION_REPORT_ORDER_PAGE_ID = b
  process.env.BLOB_READ_WRITE_TOKEN = "test-blob"
  process.env.NOTION_TOKEN = "test-notion"
  const store = new MemoryStore()
  coverStore.read = path => store.read(path)
  coverStore.write = (...args) => store.write(...args)
  coverStore.version = path => store.version(path)
  global.fetch = async input => {
    assert.ok(!String(input).includes("data_sources"), "An order edit must not regenerate covers or query reports")
    return Response.json(String(input).includes("/pages/") ? { archived: false } : { results: [numbered(a)], has_more: false })
  }
  assert.equal((await adminSync(new Request("https://test/api", { method: "POST" }))).status, 401)
  const raw = JSON.stringify({ type: "page.content_updated", entity: { type: "page", id: b } })
  assert.equal((await webhook(new Request("https://test/api", { method: "POST", body: raw }))).status, 401)
  assert.equal(store.writes, 0)
  const signature = `sha256=${createHmac("sha256", process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN).update(raw).digest("hex")}`
  assert.equal((await webhook(new Request("https://test/api", { method: "POST", body: raw, headers: { "x-notion-signature": signature } }))).status, 200)
  assert.equal(store.writes, 1)
})
