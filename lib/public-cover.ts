import type { ContentItem } from "./content-model"
import { preparedReader, readerPreview,type ReaderPreview } from "./report-reader"

export type PublicCover = { url: string; previewUrl?: string; width?: number; height?: number; reader?:ReaderPreview }
export type CoveredItem = ContentItem & { cover?: PublicCover }
export function publicCover(item: CoveredItem) {
  const cover=item.cover
  if(item.kind!=="research" || !/^[a-f0-9]{32}$/.test(item.id) || !cover) return null
  const path=new RegExp(`^/report-covers/${item.id}/[a-f0-9]{64}\\.webp$`)
  if(!path.test(cover.url)) return null
  const reader=readerPreview(item.id,cover.reader)
  const pdf=preparedReader(item.id,cover.reader)?.pdf
  if(reader && pdf?.chunkSize) {
    reader.rangeOnly=true
    if(pdf.initialChunks)reader.transport={key:pdf.url.split('/').at(-1)!.slice(0,-4),bytes:pdf.bytes,chunks:pdf.initialChunks}
  }
  return { url:cover.url, previewUrl:cover.previewUrl && path.test(cover.previewUrl)?cover.previewUrl:cover.url,...(reader?{reader}:{}),
    ...([cover.width,cover.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=4096)?{width:cover.width,height:cover.height}:{}) }
}
