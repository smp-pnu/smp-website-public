import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodePdfPageImage } from '../lib/pdf-page-encoding'

function fixture(sizes: number[], abort?: AbortController) {
  const calls: { type?: string; quality?: number }[] = []
  return { calls, canvas: { toBlob(callback: BlobCallback, type?: string, quality?: number) {
    calls.push({type,quality})
    callback(new Blob([new Uint8Array(sizes[calls.length - 1])], {type}))
    abort?.abort()
  } } }
}
test('ordinary report pages use lossless PNG without a second encode', async () => {
  const f = fixture([500_000])
  const image = await encodePdfPageImage(f.canvas, new AbortController().signal)
  assert.equal(image.type, 'image/png')
  assert.equal(f.calls.length, 1)
})
test('large images retain high-quality WebP compression within the existing cache', async () => {
  const f = fixture([2_000_000, 500_000])
  const image = await encodePdfPageImage(f.canvas, new AbortController().signal)
  assert.equal(image.size, 500_000)
  assert.deepEqual(f.calls[1], {type:'image/webp',quality:0.94})
})
test('keeps the smaller PNG if the browser cannot compress it more efficiently', async () => {
  const f = fixture([2_000_000, 2_500_000])
  assert.equal((await encodePdfPageImage(f.canvas, new AbortController().signal)).type, 'image/png')
})
test('leaving the document during encoding stops further work', async () => {
  const abort = new AbortController(), f = fixture([2_000_000], abort)
  await assert.rejects(encodePdfPageImage(f.canvas, abort.signal), {name:'AbortError'})
  assert.equal(f.calls.length, 1)
})
