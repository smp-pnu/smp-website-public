// Export the square SMP eagle mark at browser icon sizes.
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const source = await sharp('public/smp-eagle-mark.png')
  .resize(256, 256).png({ palette: true }).toBuffer()
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,${source.toString('base64')}"/></svg>\n`
for (const name of ['icon.svg', 'smp-favicon.svg']) await writeFile(`public/${name}`, svg)
for (const [name, size] of [['smp-favicon-32.png', 32], ['apple-icon.png', 180], ['icon-light-32x32.png', 32], ['icon-dark-32x32.png', 32]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/${name}`)
}
// A PNG-backed ICO supports browsers that request /favicon.ico automatically.
const png = await sharp(Buffer.from(svg)).resize(32, 32).png().toBuffer()
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
