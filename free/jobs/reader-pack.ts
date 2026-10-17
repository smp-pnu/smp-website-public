import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { renderReaderPackPages } from '../../lib/pdf-preview-render'
import { encodePagePack, pagePackMaxBytes, type PackedPage, type PagePackAsset } from '../../lib/pdf-page-pack'

// Optional acceleration generated once per PDF, within the existing publisher.
// Never retain dozens of full-size canvases/PNGs or fetch an extra Drive copy.
export async function prepareReaderPack(id: string, data: Uint8Array, previous?: PagePackAsset) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid report ID')
  if (previous && new RegExp(`^/_reader-pdfs/${id}/[a-f0-9]{64}\\.pack$`).test(previous.url)) {
    try {
      const bytes = await readFile(`.smp-cache/reader-pdfs/${previous.url.slice('/_reader-pdfs/'.length)}`)
      if (bytes.length === previous.bytes && createHash('sha256').update(bytes).digest('hex') === previous.url.split('/').at(-1)!.slice(0,-5)) return previous
    } catch { /* A restored/re-published report may need its optional pack again. */ }
  }
  const pages: PackedPage[] = []
  let size = 0
  await renderReaderPackPages(data, async page => {
    const bytes = await sharp(page.png).webp({quality:94}).toBuffer()
    size += bytes.length
    if (size > pagePackMaxBytes - 16_396) throw new Error('Page pack exceeds budget')
    pages.push({page:page.page,width:page.width,height:page.height,data:bytes})
  })
  if (!pages.length) return
  const bytes = encodePagePack(pages), hash = createHash('sha256').update(bytes).digest('hex')
  await mkdir(`.smp-cache/reader-pdfs/${id}`, {recursive:true})
  await writeFile(`.smp-cache/reader-pdfs/${id}/${hash}.pack`, bytes)
  return {url:`/_reader-pdfs/${id}/${hash}.pack`,bytes:bytes.length}
}
