// Preserve the approved artwork; vary only the ink/background for each surface.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = await readFile('public/smp-s-white.svg', 'utf8')
// Preserve the approved artwork, including its beak contour and feather positions.
const mark = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>'))
const viewBox = source.match(/viewBox="([^"]+)"/)[1]
const [, , sourceWidth, sourceHeight] = viewBox.split(' ').map(Number)
const width = 124 * sourceWidth / sourceHeight
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><svg x="${(128 - width) / 2}" y="2" width="${width}" height="124" viewBox="${viewBox}">${mark}</svg></svg>\n`
// Modern browser tabs use transparent SVG. The alpha mask keeps the S, bird,
// and wing cuts unchanged while making the ink visible in either browser theme.
const tabSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><style>.ink{fill:#080a0c}@media(prefers-color-scheme:dark){.ink{fill:#fff}}</style><defs><mask id="mark" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128">${svg}</mask></defs><rect class="ink" width="128" height="128" mask="url(#mark)"/></svg>\n`
for (const name of ['icon.svg', 'smp-favicon.svg']) await writeFile(`public/${name}`, tabSvg)
// Old bookmarked icon URLs must not continue serving white-only transparent
// images that disappear on the white chip used by search results.
for (const name of ['smp-favicon-32.png', 'icon-light-32x32.png', 'icon-dark-32x32.png']) {
  await sharp(Buffer.from(tabSvg), { density: 288 }).resize(32, 32).png().toFile(`public/${name}`)
}
// Keep the established raster URL stable for search crawlers. SVG is preferred
// by modern browsers; the opaque PNG also works as an Organization logo.
await sharp(Buffer.from(svg), { density: 288 }).resize(512, 512).flatten({ background: '#080a0c' })
  .negate({ alpha: false }).png().toFile('public/smp-search-icon-light.png')
await sharp('public/smp-search-icon-light.png').resize(192, 192).png().toFile('public/smp-search-icon.png')
// Google may also select apple-touch-icon as its favicon. Never leave the old
// white-on-transparent artwork here while advertising a contrasting PNG above.
await sharp('public/smp-search-icon-light.png').resize(180, 180).png().toFile('public/apple-icon.png')
// Keep a square, opaque legacy icon available to clients requesting /favicon.ico.
const png = await sharp('public/smp-search-icon-light.png').resize(48, 48).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header[6] = 48
header[7] = 48
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14)
header.writeUInt32LE(22, 18)
await writeFile('public/favicon.ico', Buffer.concat([header, png]))
