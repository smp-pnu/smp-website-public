// Preserve the approved artwork: transparent white tabs, white-on-black search/touch icons.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = await readFile('public/smp-s-white.svg', 'utf8')
// Preserve the source artwork, including its beak contour and feather positions.
const mark = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>'))
const viewBox = source.match(/viewBox="([^"]+)"/)[1]
const [, , sourceWidth, sourceHeight] = viewBox.split(' ').map(Number)
const width = 124 * sourceWidth / sourceHeight
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><svg x="${(128 - width) / 2}" y="2" width="${width}" height="124" viewBox="${viewBox}">${mark}</svg></svg>\n`
// The alpha mask preserves the S, bird and wing cuts. Tab ink is always white,
// regardless of browser theme; the rect is masked, not an opaque background.
const tabSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><mask id="mark" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128">${svg}</mask></defs><rect fill="#fff" width="128" height="128" mask="url(#mark)"/></svg>\n`
// Keep the tiny transparent tab image separate from the initial HTML. The
// browser-only compatibility script selects it; crawlers retain the search icon.
const tabPng = await sharp(Buffer.from(tabSvg), { density: 288 }).resize(32, 32)
  .png({ palette: true, colours: 64, effort: 10 }).toBuffer()
await writeFile('lib/tab-icon.json', JSON.stringify({ src: `data:image/png;base64,${tabPng.toString('base64')}`, size: 32 }, null, 2) + '\n')
// Safari does not support data-URL favicons (WebKit bug 236616).
// Its early compatibility script loads this identical raster instead.
await writeFile('public/smp-tab-mark.png', tabPng)
// Naver places our favicon in a 16px box inside its own 24px circular chip.
// A circular backdrop avoids square corners in that chip. Fit the unchanged
// artwork inside the disc, leaving 2px at its furthest point so no feather clips.
const searchScale = 118 / 124
const searchInset = 64 * (1 - searchScale)
const searchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="64" fill="#000"/><g transform="translate(${searchInset} ${searchInset}) scale(${searchScale})">${tabSvg}</g></svg>\n`
for (const name of ['icon.svg', 'smp-favicon.svg']) await writeFile(`public/${name}`, searchSvg)
// Preserve old URLs that search engines may already have stored.
for (const name of ['smp-favicon-32.png', 'icon-light-32x32.png', 'icon-dark-32x32.png']) {
  await sharp(Buffer.from(searchSvg), { density: 288 }).resize(32, 32).png({ palette: true, colours: 64, effort: 10 }).toFile(`public/${name}`)
}
// Keep established search/touch raster URLs stable. These get a black backdrop
// so the white S remains visible even on Google's white search-result chip.
// Advertise the root ICO for search and retain PNG aliases at stable URLs.
// Render from the same alpha mask as the tab, discarding invisible RGB noise.
// A small indexed PNG avoids sending a large true-colour image to favicon crawlers.
await sharp(Buffer.from(searchSvg), { density: 288 }).resize(512, 512)
  .png({ palette: true, colours: 64, effort: 10 }).toFile('public/smp-search-icon-light.png')
await sharp('public/smp-search-icon-light.png').resize(192, 192).png({ palette: true, colours: 64, effort: 10 }).toFile('public/smp-search-icon.png')
// Home-screen icons retain their opaque square tile; the OS supplies its mask.
const touchTile = await sharp(Buffer.from(tabSvg), { density: 288 }).resize(512, 512)
  .flatten({ background: '#000000' }).png({ palette: true, colours: 64, effort: 10 }).toBuffer()
await sharp(touchTile).resize(180, 180).png({ palette: true, colours: 64, effort: 10 }).toFile('public/apple-icon.png')
// Root favicon requests get a contrasting raster too, including search crawlers
// and browsers that do not run the transparent-tab compatibility script.
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
