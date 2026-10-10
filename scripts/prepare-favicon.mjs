// Export the approved white S with three swept wing cuts on a transparent canvas.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = await readFile('public/smp-s-white.svg', 'utf8')
// Preserve the approved artwork, including its beak contour and feather positions.
const mark = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>'))
const viewBox = source.match(/viewBox="([^"]+)"/)[1]
const [, , sourceWidth, sourceHeight] = viewBox.split(' ').map(Number)
const width = 124 * sourceWidth / sourceHeight
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><svg x="${(128 - width) / 2}" y="2" width="${width}" height="124" viewBox="${viewBox}">${mark}</svg></svg>\n`
for (const name of ['icon.svg', 'smp-favicon.svg']) await writeFile(`public/${name}`, svg)
for (const [name, size] of [['smp-favicon-32.png', 32], ['apple-icon.png', 180], ['icon-light-32x32.png', 32], ['icon-dark-32x32.png', 32]]) {
  await sharp(Buffer.from(svg), { density: 288 }).resize(size, size).png().toFile(`public/${name}`)
}
// A PNG-backed ICO supports browsers that request /favicon.ico automatically.
const png = await sharp(Buffer.from(svg), { density: 288 }).resize(32, 32).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header[6] = 32
header[7] = 32
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14)
header.writeUInt32LE(22, 18)
await writeFile('public/favicon.ico', Buffer.concat([header, png]))
