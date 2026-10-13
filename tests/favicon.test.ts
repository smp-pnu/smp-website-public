import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import sharp from 'sharp'
import tabIcon from '../lib/tab-icon.json'

async function readPixels(bytes: Buffer) {
  return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

async function assertSearchContrast(bytes: Buffer, label: string, round = true) {
  const { data, info } = await readPixels(bytes)
  assert.equal(info.width, info.height, label)
  // Only the corners outside the disc may be transparent. The white artwork
  // and all of its negative spaces must still have an opaque black backdrop.
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const radius = Math.hypot(x + 0.5 - info.width / 2, y + 0.5 - info.height / 2)
    // Lanczos resizing can soften the outermost three pixels of a raster disc.
    if (!round || radius < info.width / 2 - 3) assert.equal(data[(y * info.width + x) * 4 + 3], 255, `${label}: transparent interior`)
  }
  for (const pixel of [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1]) {
    assert.equal(data[pixel * 4 + 3], round ? 0 : 255, `${label}: corner opacity`)
  }
  let darkBackdrop = 0
  for (let i = 0; i < data.length; i += 4) if (data[i] < 32 && data[i + 1] < 32 && data[i + 2] < 32 && data[i + 3] >= 240) darkBackdrop++
  assert.ok(darkBackdrop > info.width * info.height / 10, `${label}: missing black backdrop`)
  assert.ok(data.some((value, i) => i % 4 === 0 && value > 240), `${label}: missing white mark`)
}

test('inline tab icon retains white artwork and a transparent background', async () => {
  assert.match(tabIcon.src, /^data:image\/png;base64,/)
  const bytes = Buffer.from(tabIcon.src.split(',')[1], 'base64')
  assert.deepEqual(await readFile(new URL('../public/smp-tab-mark.png', import.meta.url)), bytes)
  const { data, info } = await readPixels(bytes)
  assert.equal(info.width, tabIcon.size)
  assert.equal(info.height, tabIcon.size)
  let visible = 0, transparent = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) { transparent++; continue }
    visible++
    assert.ok(data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250, 'tab ink must remain white')
  }
  assert.ok(visible > 100 && transparent > 100, 'the tab must contain both the mark and negative space')
  assert.equal(data[3], 0)
})

test('all current and legacy fetchable favicon URLs keep search contrast', async () => {
  for (const name of ['icon.svg', 'smp-favicon.svg', 'smp-favicon-32.png', 'icon-light-32x32.png', 'icon-dark-32x32.png', 'smp-search-icon.png', 'smp-search-icon-light.png', 'apple-icon.png']) {
    await assertSearchContrast(await readFile(new URL(`../public/${name}`, import.meta.url)), name, name !== 'apple-icon.png')
  }
  const ico = await readFile(new URL('../public/favicon.ico', import.meta.url))
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const entry = 6 + 16 * i, start = ico.readUInt32LE(entry + 12), size = ico.readUInt32LE(entry + 8)
    await assertSearchContrast(ico.subarray(start, start + size), `ICO frame ${i}`)
  }
})

test('Safari compatibility replaces unsupported inline icons without altering Chromium candidates', async () => {
  const script = await readFile(new URL('../public/tab-icon-compat.js', import.meta.url), 'utf8')
  for (const [vendor, userAgent, needsFallback] of [
    ['Apple Computer, Inc.', 'Version/26.0 Safari/605.1.15', true],
    ['Google Inc.', 'Chrome/140.0.0.0 Safari/537.36', false],
    ['Google Inc.', 'Chrome/140.0.0.0 Safari/537.36 (compatible; Googlebot/2.1)', false],
  ] as const) {
    const icons = ['/favicon.ico', '/smp-search-icon.png', tabIcon.src].map(href => ({ href, type: 'image/png', sizes: { value: '32x32' } }))
    const before = icons.map(icon => icon.href)
    runInNewContext(script, { navigator: { vendor, userAgent }, document: { querySelectorAll: () => icons } })
    assert.deepEqual(icons.map(icon => icon.href), needsFallback ? icons.map(() => '/smp-tab-mark.png') : before)
  }
})
