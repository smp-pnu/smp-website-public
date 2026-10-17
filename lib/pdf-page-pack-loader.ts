import { decodePagePack, pagePackMaxBytes, type PagePackHint } from './pdf-page-pack'
import type { PreparedPdfPage } from './pdf-page-cache'

// One bounded request per document, reused across page turns and window resizes.
// The server verifies publication and the current PDF before serving this pack.
export function createPagePackLoader(url: string, pdfKey: string, hint: PagePackHint, count: number, fetcher: typeof fetch = fetch) {
  const abort = new AbortController()
  let pending: Promise<Map<number,{blob:Blob;width:number;ratio:number}> | undefined> | undefined
  async function load() {
    if (!/^[a-f0-9]{64}$/.test(pdfKey) || !/^[a-f0-9]{64}$/.test(hint.key) || !Number.isSafeInteger(hint.bytes) || hint.bytes < 14 || hint.bytes > pagePackMaxBytes) return
    const response = await fetcher(`${url}${url.includes('?')?'&':'?'}prepared=${pdfKey}&pages=${hint.key}`, {
      signal:AbortSignal.any([abort.signal,AbortSignal.timeout(Math.max(20000,Math.ceil(hint.bytes/(512*1024))*1000))]),redirect:'error',
    })
    if (!response.ok || response.headers.get('content-type') !== 'application/octet-stream'
      || Number(response.headers.get('content-length')) !== hint.bytes || !response.body) { await response.body?.cancel(); return }
    const bytes = new Uint8Array(hint.bytes), reader = response.body.getReader()
    let offset=0
    try {
      while(true) {
        const {value,done}=await reader.read()
        if(done)break
        if(offset+value.length>bytes.length)throw new Error('Oversized page pack')
        bytes.set(value,offset);offset+=value.length
      }
    } finally {await reader.cancel()}
    if(offset!==bytes.length)throw new Error('Incomplete page pack')
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')
    if(hash!==hint.key)throw new Error('Page pack integrity mismatch')
    abort.signal.throwIfAborted()
    return new Map(decodePagePack(bytes,count).map(page=>[page.page,{blob:new Blob([new Uint8Array(page.data)],{type:'image/webp'}),width:page.width,ratio:page.height/page.width}]))
  }
  return {
    async readAll(signal:AbortSignal): Promise<PreparedPdfPage[] | undefined> {
      signal.throwIfAborted();abort.signal.throwIfAborted()
      pending ??= load().catch(()=>undefined)
      const entries=await pending
      signal.throwIfAborted();abort.signal.throwIfAborted()
      if(!entries)return
      return [...entries].map(([page,entry])=>({page,url:URL.createObjectURL(entry.blob),bytes:entry.blob.size,ratio:entry.ratio,width:entry.width}))
    },
    async read(page: number, signal: AbortSignal): Promise<PreparedPdfPage | undefined> {
      signal.throwIfAborted()
      abort.signal.throwIfAborted()
      pending ??= load().catch(()=>undefined)
      const entry=(await pending)?.get(page)
      signal.throwIfAborted()
      if(entry)return {page,url:URL.createObjectURL(entry.blob),bytes:entry.blob.size,ratio:entry.ratio,width:entry.width}
    },
    dispose() {abort.abort();pending=undefined},
  }
}
