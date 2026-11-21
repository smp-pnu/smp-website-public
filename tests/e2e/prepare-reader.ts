// Synthetic prepared pages exercise the production pack reader without Drive.
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { upstreamFetch } from '../cloudflare/fixture'
import { encodePagePack } from '../../lib/pdf-page-pack'
import { sourceKey } from '../../lib/report-source-key'
import { toContentItem, type NotionPage } from '../../lib/content-model'

async function main() {
const id = 'a0000000000000000000000000000001'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const pdf = new Uint8Array(await (await upstreamFetch('https://drive.usercontent.google.com/download?id=fixture-report-1')).arrayBuffer())
const item = toContentItem(await (await upstreamFetch(`https://api.notion.com/v1/pages/${id}`)).json() as NotionPage, 'research')!
const pageBytes = await Promise.all([1, 2, 3].map(async page => ({ page, width: 595, height: 842, data: new Uint8Array(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842"><rect width="595" height="842" fill="white"/><text x="40" y="120" font-size="32">SMP QA PAGE ${page}</text><text x="40" y="170" font-size="16">Synthetic browser test only</text></svg>`)).webp().toBuffer()) })))
const pages = []
await mkdir(`dist/free/client/report-covers/${id}`, { recursive: true })
for (const page of pageBytes) {
  const url = `/report-covers/${id}/${hash(page.data)}.webp`
  await writeFile('dist/free/client' + url, page.data)
  pages.push({ page: page.page, url, width: page.width, height: page.height })
}
const pack = encodePagePack(pageBytes)
const url = `/_reader-pdfs/${id}/${hash(pack)}.pack`
await mkdir(`dist/free/client/_reader-pdfs/${id}`, { recursive: true })
await writeFile('dist/free/client' + url, pack)
const cover = { url: pages[0].url, previewUrl: pages[0].url, width: 595, height: 842, sourceKey: sourceKey(item), pdfHash: hash(pdf), reader: { version: 1, pageCount: 3, pages, pagePack: { url, bytes: pack.length }, pagePackVersion: 2, source: { key: hash(pdf), bytes: pdf.length, modified: 'Thu, 01 Jan 2026 00:00:00 GMT', checkedAt: Date.now() } } }
await appendFile('.smp-cache/fixture-seed.sql', `\nUPDATE free_content SET cover='${JSON.stringify(cover).replaceAll("'", "''")}' WHERE id='${id}';\n`)
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
