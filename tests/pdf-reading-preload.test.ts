import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fillPdfReadingCache } from '../lib/pdf-reading-preload'

test('whole-document preload observes visibility, cancellation and connection guards', async () => {
  let downloads = 0, cancelled = false
  const pdf = { numPages: 27, getData: async () => { downloads++; return new Uint8Array() } }
  assert.equal(await fillPdfReadingCache(pdf, { cancelled: () => false, beforeFullDownload: async () => true }), true)
  assert.equal(downloads, 1)
  await fillPdfReadingCache(pdf, { cancelled: () => true, beforeFullDownload: async () => true })
  await fillPdfReadingCache(pdf, { cancelled: () => false, beforeFullDownload: async () => false })
  await fillPdfReadingCache(pdf, { cancelled: () => cancelled, beforeFullDownload: async () => { cancelled = true; return true } })
  assert.equal(downloads, 1)
})

test('page preparation can overlap an allowed download without claiming completion', async () => {
  let finish!: (bytes: Uint8Array) => void
  const events: string[] = []
  const pdf = {numPages: 27, getData: () => { events.push('download'); return new Promise<Uint8Array>(resolve => { finish = resolve }) }}
  const result = fillPdfReadingCache(pdf, {cancelled: () => false, beforeFullDownload: async () => true, started: () => events.push('prepare')}).then(done => { events.push('complete'); return done })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(events, ['download', 'prepare'])
  finish(new Uint8Array())
  assert.equal(await result, true)
  assert.deepEqual(events, ['download', 'prepare', 'complete'])
  await fillPdfReadingCache(pdf, {cancelled: () => false, beforeFullDownload: async () => false, started: () => events.push('unexpected')})
  assert.equal(events.length, 3)
})
