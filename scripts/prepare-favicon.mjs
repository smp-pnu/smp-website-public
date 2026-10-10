// Export the approved bird aperture badge; the bird itself stays transparent.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = await readFile('public/smp-bird-badge.svg', 'utf8')
// Target only the badge fill: white and black inside its mask define the cutout.
const badgeFill = 'fill="#10263a"'
if (source.split(badgeFill).length !== 2) throw new Error('Expected one badge fill in the approved source')
const light = source.replace(badgeFill, `id="badge" ${badgeFill}`)
const dark = light.replace(badgeFill, 'fill="#ffffff"')
const svg = light.replace('</svg>', '<style>@media (prefers-color-scheme: dark) { #badge { fill: #ffffff; } }</style></svg>')
for (const name of ['icon.svg', 'smp-favicon.svg']) await writeFile(`public/${name}`, svg)
for (const [name, size, mark] of [
  ['smp-favicon-32.png', 32, light],
  ['apple-icon.png', 180, light],
  ['icon-light-32x32.png', 32, light],
  ['icon-dark-32x32.png', 32, dark],
]) {
  await sharp(Buffer.from(mark), { density: 288 }).resize(size, size).png().toFile(`public/${name}`)
}
// A PNG-backed ICO supports browsers that request /favicon.ico automatically.
const png = await sharp(Buffer.from(light), { density: 288 }).resize(32, 32).png().toBuffer()
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
