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

test('served HTML advertises one absolute, high-contrast icon and no transparent candidate', async () => {
  const html = await readFile(new URL('../free/client/index.html', import.meta.url), 'utf8')
  const icons = html.match(/<link\b[^>]*rel="icon"[^>]*>/g) || []
  assert.equal(icons.length, 1)
  assert.match(icons[0], /href="https:\/\/pnusmp\.com\/favicon\.ico"/)
  assert.match(icons[0], /type="image\/vnd\.microsoft\.icon"/)
  const ico = await readFile(new URL('../public/favicon.ico', import.meta.url))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1, 'the root icon must be an ICO, not a renamed PNG')
  const sizes = []
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const entry = 6 + 16 * i, start = ico.readUInt32LE(entry + 12), length = ico.readUInt32LE(entry + 8)
    const { width, height } = await sharp(ico.subarray(start, start + length)).metadata()
    assert.equal(width, ico[entry] || 256)
    assert.equal(height, ico[entry + 1] || 256)
    sizes.push(`${width}x${height}`)
  }
  assert.equal(icons[0].match(/sizes="([^"]+)"/)?.[1], sizes.join(' '))
  assert.doesNotMatch(html, /data:image|__SMP_TAB_ICON__|smp-tab-mark/)
  assert.ok(html.indexOf('/tab-icon-compat.js') > html.indexOf(icons[0]))
})

test('browser tabs use white transparent artwork but rendering crawlers retain the search icon', async () => {
  const script = await readFile(new URL('../public/tab-icon-compat.js', import.meta.url), 'utf8')
  for (const [userAgent, transparentTab] of [
    ['Version/26.0 Safari/605.1.15', true],
    ['Chrome/140.0.0.0 Safari/537.36', true],
    ['Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', true],
    ['Firefox/143.0', true],
    ['Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', false],
    ['Chrome/140.0.0.0 Safari/537.36 (compatible; Google-InspectionTool/1.0)', false],
    ['Googlebot-Image/1.0', false],
    ['Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 (compatible; GoogleOther)', false],
    ['Mozilla/5.0 Chrome/49.0.2623.75 Safari/537.36 Google Favicon', false],
    ['Chrome/140.0.0.0 Safari/537.36 (compatible; bingbot/2.0)', false],
    ['Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)', false],
    ['Chrome/140.0.0.0 Safari/537.36 Chrome-Lighthouse', false],
    ['', false],
  ] as const) {
    const searchSizes = '16x16 32x32 48x48 96x96 256x256'
    const icon = { href: 'https://pnusmp.com/favicon.ico', type: 'image/vnd.microsoft.icon', sizes: { value: searchSizes } }
    const context = { navigator: { userAgent }, document: { querySelector: () => icon } }
    runInNewContext(script, context)
    runInNewContext(script, context)
    assert.equal(icon.href, transparentTab ? '/smp-tab-mark.png' : 'https://pnusmp.com/favicon.ico', userAgent)
    assert.equal(icon.type, transparentTab ? 'image/png' : 'image/vnd.microsoft.icon', userAgent)
    assert.equal(icon.sizes.value, transparentTab ? '32x32' : searchSizes, userAgent)
  }
  assert.doesNotThrow(() => runInNewContext(script, { navigator: { userAgent: 'Safari/605.1.15' }, document: { querySelector: () => null } }))
})

test('automated browsers retain the contrasting search icon even with a regular browser UA', async () => {
  const script = await readFile(new URL('../public/tab-icon-compat.js', import.meta.url), 'utf8')
  const icon = { href: 'https://pnusmp.com/favicon.ico', type: 'image/vnd.microsoft.icon', sizes: { value: '16x16 32x32 48x48 96x96 256x256' } }
  runInNewContext(script, { navigator: { userAgent: 'Chrome/140.0.0.0 Safari/537.36', webdriver: true }, document: { querySelector: () => icon } })
  assert.equal(icon.href, 'https://pnusmp.com/favicon.ico')
  assert.equal(icon.type, 'image/vnd.microsoft.icon')
})
