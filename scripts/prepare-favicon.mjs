// Preserve the approved artwork; every favicon has a transparent background.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = await readFile('public/smp-s-white.svg', 'utf8')
// Preserve the source artwork, including its beak contour and feather positions.
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
  await sharp(Buffer.from(tabSvg), { density: 288 }).resize(32, 32).png({ palette: true, colours: 64, effort: 10 }).toFile(`public/${name}`)
}
// Keep the established raster URL stable for search crawlers. Any browser may
// choose this fallback instead of SVG, so it must also remain transparent.
// Dark ink stays visible on the light chip used by Google Search. Do not add a
// white-only raster candidate: crawlers can choose any advertised icon.
// Render from the same alpha mask as the tab, discarding invisible RGB noise.
// A small indexed PNG avoids sending a large true-colour image to favicon crawlers.
await sharp(Buffer.from(tabSvg), { density: 288 }).resize(512, 512)
  .png({ palette: true, colours: 64, effort: 10 }).toFile('public/smp-search-icon-light.png')
await sharp('public/smp-search-icon-light.png').resize(192, 192).png({ palette: true, colours: 64, effort: 10 }).toFile('public/smp-search-icon.png')
// Some browsers and Google also select apple-touch-icon. Keep its alpha and
// artwork identical to the fallback, rather than introducing an opaque tile.
await sharp('public/smp-search-icon-light.png').resize(180, 180).png({ palette: true, colours: 64, effort: 10 }).toFile('public/apple-icon.png')
// Supply transparent frames for legacy tabs and crawlers requesting /favicon.ico.
// Larger frames avoid limiting this fallback to a small browser-tab bitmap.
const sizes = [16, 32, 48, 96, 256]
const frames = await Promise.all(sizes.map(size =>
  sharp('public/smp-search-icon-light.png').resize(size, size).png().toBuffer(),
))
const header = Buffer.alloc(6 + 16 * frames.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)
let offset = header.length
for (const [index, frame] of frames.entries()) {
  const entry = 6 + 16 * index
  header[entry] = sizes[index] % 256
  header[entry + 1] = sizes[index] % 256
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
}
await writeFile('public/favicon.ico', Buffer.concat([header, ...frames]))
