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
