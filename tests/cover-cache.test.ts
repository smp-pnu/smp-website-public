import { test } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { prepareCover, readCover, currentCover, sourceKey, coverPrefix } from "../lib/cover-cache"
import type { CoverStore, StoredValue } from "../lib/cover-store"
import type { ContentItem } from "../lib/content-model"

const item: ContentItem = {
  id: "11111111111141118111111111111111", kind: "research", title: "R1", summary: "", date: "2026-01-01",
  category: "리서치", author: "", pinned: false, attachments: [],
  externalUrl: "https://drive.google.com/file/d/abcdefghijk123/view", editedAt: "2026-01-01T00:00:00Z",
}
class MemoryStore implements CoverStore {
  values = new Map<string, StoredValue>()
  writes = 0
  async read(path: string) { return this.values.get(path) ?? null }
  async write(path: string, bytes: Uint8Array, _type: string, options: { etag?: string; immutable?: boolean } = {}) {
    const previous = this.values.get(path)
    if (!options.immutable && (previous?.etag !== options.etag)) throw new Error("Precondition failed")
    this.values.set(path, { bytes, etag: String(++this.writes) })
    return `https://test.public.blob.vercel-storage.com/${path}`
  }
  async remove(paths: string[]) { paths.forEach(path => this.values.delete(path)) }
  async paths(prefix: string) { return [...this.values.keys()].filter(path => path.startsWith(prefix)) }
}
const png = (color = "navy") => sharp({ create: { width: 900, height: 1300, channels: 3, background: color } }).png().toBuffer()

test("publication creates a separate WebP once; later list/image reads reuse it", async () => {
  const store = new MemoryStore()
  let downloads = 0
  const options = { store, item, fetchImage: async () => { downloads++; return png() }, latestItem: async () => item }
  const first = await prepareCover(options)
  assert.ok(first)
  assert.equal(first.width, 720)
  assert.equal((await sharp(store.values.get(`${coverPrefix(item.id)}${first.hash}.webp`)!.bytes).metadata()).format, "webp")
  const writes = store.writes
  assert.deepEqual(await prepareCover(options), first)
  assert.equal(downloads, 1)
  assert.equal(store.writes, writes)
  assert.equal(currentCover((await readCover(store, item.id)).cover, item), true)
})

test("replacing a PDF changes the image URL; expired Notion signatures do not change file identity", async () => {
  const store = new MemoryStore()
  const first = await prepareCover({ store, item, fetchImage: () => png(), latestItem: async () => item })
  const replacement = { ...item, externalUrl: "https://drive.google.com/file/d/replacement456/view", editedAt: "2026-01-02T00:00:00Z" }
  assert.equal(currentCover(first, replacement), false)
  const second = await prepareCover({ store, item: replacement, fetchImage: () => png("red"), latestItem: async () => replacement })
  assert.notEqual(second!.url, first!.url)
  const attached = (signature: string) => ({ ...item, externalUrl: null, attachments: [{ name: "report.pdf", url: `https://prod-files-secure.s3.us-west-2.amazonaws.com/report.pdf?sig=${signature}` }] })
  assert.equal(sourceKey(attached("old")), sourceKey(attached("new")))
})

test("daily reconciliation detects a new version behind the same Drive URL without rewriting unchanged images", async () => {
  const store = new MemoryStore()
  const options = { store, item, latestItem: async () => item }
  const first = await prepareCover({ ...options, fetchImage: () => png() })
  const writes = store.writes
  assert.deepEqual(await prepareCover({ ...options, force: true, fetchImage: () => png() }), first)
  assert.equal(store.writes, writes)
  const changed = await prepareCover({ ...options, force: true, fetchImage: () => png("green") })
  assert.notEqual(changed!.url, first!.url)
})

test("unpublishing or replacing a report while generation is running prevents saving the stale result", async () => {
  for (const latest of [null, { ...item, editedAt: "2026-01-02T00:00:00Z" }, { ...item, externalUrl: "https://drive.google.com/file/d/replacement456/view" }]) {
    const store = new MemoryStore()
    assert.equal(await prepareCover({ store, item, fetchImage: () => png(), latestItem: async () => latest }), null)
    assert.equal(store.writes, 0)
  }
})

test("a failed source refresh preserves the last saved cover", async () => {
  const store = new MemoryStore()
  const options = { store, item, latestItem: async () => item }
  const first = await prepareCover({ ...options, fetchImage: () => png() })
  await assert.rejects(prepareCover({ ...options, force: true, fetchImage: async () => { throw new Error("Drive unavailable") } }))
  assert.deepEqual((await readCover(store, item.id)).cover, first)
})

test("metadata cannot redirect images to an untrusted host or another report", async () => {
  const store = new MemoryStore()
  const first = await prepareCover({ store, item, fetchImage: () => png(), latestItem: async () => item })
  for (const url of ["https://evil.test/pixel", first!.url.replace(item.id, "22222222222242228222222222222222"), `${first!.url}?tracking=1`]) {
    store.values.set(`${coverPrefix(item.id)}current.json`, { bytes: Buffer.from(JSON.stringify({ ...first, url })), etag: "tampered" })
    await assert.rejects(readCover(store, item.id), /Invalid cover/)
  }
  assert.throws(() => coverPrefix("../private"), /Invalid report ID/)
})

test("duplicate publication events converge to a single reusable image", async () => {
  const store = new MemoryStore()
  const options = { store, item, fetchImage: () => png(), latestItem: async () => item }
  const results = await Promise.all([prepareCover(options), prepareCover(options)])
  assert.equal(results[0]!.url, results[1]!.url)
  assert.equal(store.values.size, 2)
})

test("cover refresh uses the current storage version when CDN metadata is stale", async () => {
  const store = new MemoryStore()
  const versionedStore: CoverStore = Object.assign(store, {
    async version(path: string) { return store.values.get(path)?.etag },
  })
  const options = { store: versionedStore, item, latestItem: async () => item }
  const first = await prepareCover({ ...options, fetchImage: () => png() })
  const path = `${coverPrefix(item.id)}current.json`
  const stale = store.values.get(path)!
  await prepareCover({ ...options, force: true, fetchImage: () => png("red") })
  store.read = async name => name === path ? stale : store.values.get(name) ?? null
  // The source returns to A while the CDN also still shows A. Storage is B;
  // comparing the image alone would incorrectly skip the write.
  const restored = await prepareCover({ ...options, force: true, fetchImage: () => png() })
  assert.equal(restored!.url, first!.url)
  assert.equal(JSON.parse(Buffer.from(store.values.get(path)!.bytes).toString()).url, first!.url)
})
