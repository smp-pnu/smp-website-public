export const pagePackMaxBytes = 16 * 1024 * 1024
export const pagePackMaxPages = 60
export type PagePackAsset = { url: string; bytes: number }
export type PagePackHint = { key: string; bytes: number }
export type PackedPage = { page: number; width: number; height: number; data: Uint8Array }
const magic = new TextEncoder().encode('SMPPAGE1')

export function encodePagePack(pages: PackedPage[]) {
  let offset = 0
  const entries = pages.map(({page,width,height,data}) => {
    const entry = {page,width,height,offset,bytes:data.length}
    offset += data.length
    return entry
  })
  const header = new TextEncoder().encode(JSON.stringify(entries))
  const size = 12 + header.length + offset
  if (size > pagePackMaxBytes) throw new Error('Page pack exceeds budget')
  const bytes = new Uint8Array(size)
  bytes.set(magic)
  new DataView(bytes.buffer).setUint32(8, header.length)
  bytes.set(header, 12)
  pages.forEach((page, i) => bytes.set(page.data, 12 + header.length + entries[i].offset))
  // Apply the same bounds to generated and downloaded packs.
  decodePagePack(bytes, pages.length)
  return bytes
}

export function decodePagePack(bytes: Uint8Array, expectedPages: number): PackedPage[] {
  if (!Number.isInteger(expectedPages) || expectedPages < 1 || expectedPages > pagePackMaxPages
    || bytes.length < 14 || bytes.length > pagePackMaxBytes || magic.some((b,i) => bytes[i] !== b)) throw new Error('Invalid page pack')
  const headerSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8)
  if (headerSize > 16_384 || 12 + headerSize >= bytes.length) throw new Error('Invalid page pack header')
  const entries = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerSize)))
  if (!Array.isArray(entries) || entries.length !== expectedPages) throw new Error('Incomplete page pack')
  let offset = 0
  const result = entries.map((entry, index) => {
    if (!entry || entry.page !== index + 1 || entry.offset !== offset
      || ![entry.width,entry.height].every(v => Number.isSafeInteger(v) && v > 0 && v <= 4096)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 12 || 12 + headerSize + offset + entry.bytes > bytes.length) throw new Error('Invalid packed page')
    const data = bytes.subarray(12 + headerSize + offset, 12 + headerSize + offset + entry.bytes)
    if (String.fromCharCode(...data.subarray(0,4)) !== 'RIFF' || String.fromCharCode(...data.subarray(8,12)) !== 'WEBP') throw new Error('Invalid page image')
    offset += entry.bytes
    return {page:entry.page,width:entry.width,height:entry.height,data}
  })
  if (12 + headerSize + offset !== bytes.length) throw new Error('Unexpected page pack data')
  return result
}
