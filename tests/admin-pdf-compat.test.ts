import assert from "node:assert/strict"
import { test } from "node:test"
import { readPdfText } from "../admin-lab/pdf-text"
import { encodePdfCover } from "../admin-lab/pdf-cover"
import { coverLimit } from "../admin-cloud/protocol"

test("PDF text extraction works without ReadableStream async iteration and preserves line breaks", async () => {
  const stream = new ReadableStream({ start(c) {
    c.enqueue({ items: [{ str: "티씨케이", hasEOL: true }, { type: "beginMarkedContent" }] })
    c.enqueue({ items: [{ str: "목표주가" }, { str: "150,000원", hasEOL: true }] }); c.close()
  } })
  Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined })
  assert.equal(await readPdfText(stream, new AbortController().signal), "티씨케이\n목표주가 150,000원\n")
  assert.equal(stream.locked, false)
})
test("PDF text limits cancel excess data and release the stream lock", async () => {
  let cancelled = false
  const stream = new ReadableStream({ start(c) { c.enqueue({ items: [{ str: "a".repeat(20_000) }] }) }, cancel() { cancelled = true } })
  assert.equal((await readPdfText(stream, new AbortController().signal)).length, 12_000)
  assert.equal(cancelled, true); assert.equal(stream.locked, false)
})
test("PDF text pending reads are cancellable and errors release the lock", async () => {
  const controller = new AbortController(), stream = new ReadableStream()
  const pending = readPdfText(stream, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: "AbortError" })
  assert.equal(stream.locked, false)
  const broken = new ReadableStream({ start(c) { c.error(Error("PDF stream failed")) } })
  await assert.rejects(readPdfText(broken, new AbortController().signal), /PDF stream failed/)
  assert.equal(broken.locked, false)
})
test("cover encoding detects Safari's PNG fallback and requests bounded JPEG instead", async () => {
  const requested: string[] = []
  const cover = await encodePdfCover({ toBlob(callback, type) {
    requested.push(type!)
    callback(new Blob(["image"], { type: type === "image/webp" ? "image/png" : type }))
  } }, new AbortController().signal)
  assert.deepEqual(requested, ["image/webp", "image/jpeg"])
  assert.equal(cover.type, "image/jpeg")
})
test("cover encoding keeps WebP when available, bounds size and stops after cancellation", async () => {
  let calls = 0
  const cover = await encodePdfCover({ toBlob(callback, type, quality) {
    calls++
    callback(new Blob([new Uint8Array(quality! > 0.8 ? coverLimit + 1 : 50)], { type }))
  } }, new AbortController().signal)
  assert.equal(calls, 2); assert.equal(cover.type, "image/webp"); assert.equal(cover.size, 50)
  await assert.rejects(encodePdfCover({ toBlob(cb) { cb(new Blob(["PNG"], { type: "image/png" })) } }, new AbortController().signal), /표지/)
  const controller = new AbortController()
  await assert.rejects(encodePdfCover({ toBlob(cb) { controller.abort(); cb(null) } }, controller.signal), { name: "AbortError" })
})
