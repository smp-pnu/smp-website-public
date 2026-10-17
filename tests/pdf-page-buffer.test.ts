import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPdfPageBuffer, updatePdfPageBuffer } from '../lib/pdf-page-buffer'
import { preloadPdfReading } from '../lib/pdf-reading-preload'

test('first three canvases warm in order and cached page changes never clear the visible page', () => {
  let state = createPdfPageBuffer(1)
  for (const page of [1, 2, 3]) {
    state = updatePdfPageBuffer(state, { type: 'ready', page }, 27)
    assert.equal(state.visible, 1)
    assert.ok(state.entries.length <= 3)
  }
  for (const page of [2, 1, 3]) {
    state = updatePdfPageBuffer(state, { type: 'request', page }, 27)
    assert.equal(state.visible, page)
  }
  assert.ok(state.entries.some(entry => entry.page === 4 && !entry.ready))
})

test('rapid jumps retain old pixels and a late render cannot display the wrong page', () => {
  let state = updatePdfPageBuffer(createPdfPageBuffer(1), { type: 'ready', page: 1 }, 27)
  for (const page of [8, 15, 27]) {
    state = updatePdfPageBuffer(state, { type: 'request', page }, 27)
    assert.equal(state.visible, 1)
    assert.ok(state.entries.length <= 3)
  }
  state = updatePdfPageBuffer(state, { type: 'ready', page: 15 }, 27)
  assert.equal(state.visible, 1)
  state = updatePdfPageBuffer(state, { type: 'ready', page: 27 }, 27)
  assert.equal(state.visible, 27)
  assert.ok(state.entries.every(entry => entry.page <= 27))
})

test('preload prepares only the first three pages before filling the existing document cache', async () => {
  const calls: number[] = []
  const pdf = { numPages: 27, getPage: async (page: number) => ({ getOperatorList: async () => { calls.push(page) } }), getData: async () => { calls.push(0); return new Uint8Array() } }
  assert.equal(await preloadPdfReading(pdf, { cancelled: () => false, beforeFullDownload: async () => true }), true)
  assert.deepEqual(calls, [1, 2, 3, 0])
  calls.length = 0
  await preloadPdfReading(pdf, { cancelled: () => calls.length === 1, beforeFullDownload: async () => true })
  assert.deepEqual(calls, [1])
  calls.length = 0
  await preloadPdfReading({ ...pdf, numPages: 2 }, { cancelled: () => false, beforeFullDownload: async () => false })
  assert.deepEqual(calls, [1, 2])
})

test('zoomed pages keep only the visible and requested canvases without speculative renders', () => {
  let state = updatePdfPageBuffer(createPdfPageBuffer(1), { type: 'ready', page: 1 }, 27, false)
  assert.equal(state.entries.length, 1)
  state = updatePdfPageBuffer(state, { type: 'request', page: 2 }, 27, false)
  assert.equal(state.visible, 1)
  state = updatePdfPageBuffer(state, { type: 'ready', page: 2 }, 27, false)
  assert.equal(state.visible, 2)
  assert.equal(state.entries.length, 2)
})
