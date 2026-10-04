import { test } from "node:test"
import assert from "node:assert/strict"
import { createSavedCoverReader } from "../lib/saved-cover-reader"
import { coverPrefix, sourceKey, type SavedCover } from "../lib/cover-cache"
import type { CoverStore, StoredValue } from "../lib/cover-store"
import type { ContentItem } from "../lib/content-model"

const item: ContentItem = {
  id: "11111111111141118111111111111111", kind: "research", title: "R1", summary: "", date: "2026-01-01",
  category: "리서치", author: "", pinned: false, attachments: [],
  externalUrl: "https://drive.google.com/file/d/abcdefghijk123/view", editedAt: "2026-01-01T00:00:00Z",
}

function fixture() {
  let reads = 0
  let fail = false
  const values = new Map<string, StoredValue>()
  const store: CoverStore = {
    async read(path) { reads++; if (fail) throw new Error("Storage unavailable"); return values.get(path) ?? null },
    async write() { throw new Error("List reads must not write") },
    async remove() { throw new Error("List reads must not delete") },
    async paths() { throw new Error("List reads must not list the store") },
  }
  function save(report: ContentItem, hash = "a".repeat(64)) {
    const cover: SavedCover = { version: 1, sourceKey: sourceKey(report)!, editedAt: report.editedAt!, hash,
      url: `https://test.public.blob.vercel-storage.com/${coverPrefix(report.id)}${hash}.webp`, width: 720, height: 1018, bytes: 5000 }
    values.set(`${coverPrefix(report.id)}current.json`, { bytes: Buffer.from(JSON.stringify(cover)), etag: hash })
    return cover
  }
  return { store, save, reads: () => reads, fail: (value: boolean) => { fail = value } }
}

test("concurrent and repeated list reads share cover metadata until its TTL expires", async () => {
  const f = fixture()
  let time = 0
  const read = createSavedCoverReader(f.store, () => time)
  const cover = f.save(item)
  assert.deepEqual(await Promise.all([read(item), read(item), read(item)]), [cover, cover, cover])
  assert.equal(f.reads(), 1)
  time = 59_999
  assert.deepEqual(await read(item), cover)
  assert.equal(f.reads(), 1)
  const updated = f.save(item, "b".repeat(64))
  time = 60_000
  assert.deepEqual(await read(item), updated)
  assert.equal(f.reads(), 2)
})

test("edited reports and replaced source PDFs cannot reuse an old cached cover", async () => {
  const f = fixture()
  const read = createSavedCoverReader(f.store)
  f.save(item)
  await read(item)
  const edited = { ...item, editedAt: "2026-02-01T00:00:00Z" }
  assert.equal(await read(edited), null)
  const fresh = f.save(edited)
  assert.deepEqual(await read(edited), fresh)
  const replaced = { ...edited, externalUrl: "https://drive.google.com/file/d/replacement456/view" }
  assert.equal(await read(replaced), null)
  assert.equal(f.reads(), 4)
})

test("missing metadata and storage failures do not prevent a later successful read", async () => {
  const f = fixture()
  const read = createSavedCoverReader(f.store)
  assert.equal(await read(item), null)
  f.fail(true)
  await assert.rejects(read(item), /Storage unavailable/)
  f.fail(false)
  const cover = f.save(item)
  assert.deepEqual(await read(item), cover)
  assert.equal(f.reads(), 3)
})

test("cover metadata cache has a bounded size", async () => {
  const f = fixture()
  const read = createSavedCoverReader(f.store)
  f.save(item)
  await read(item)
  for (let index = 1; index <= 300; index++) {
    const report = { ...item, id: index.toString(16).padStart(32, "0") }
    f.save(report)
    await read(report)
  }
  await read(item)
  assert.equal(f.reads(), 302, "an old entry must be evicted instead of growing indefinitely")
})
