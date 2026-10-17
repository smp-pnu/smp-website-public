import { getDocument, PDFDataRangeTransport } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { resolve } from 'node:path'
import { readerPdfChunkBytes as size } from '../../lib/report-reader'

// Discover the first page's real byte dependencies on the publishing runner.
// No extra visitor API or PDF parsing work is introduced on the Worker.
export async function firstPageChunks(data:Uint8Array) {
  const chunks=new Set<number>([0])
  class Probe extends PDFDataRangeTransport {
    constructor(){super(data.length,new Uint8Array(data.subarray(0,size)),true)}
    requestDataRange(begin:number,end:number){
      for(let n=Math.floor(begin/size);n<Math.ceil(end/size);n++)chunks.add(n)
      queueMicrotask(()=>this.onDataRange(begin,new Uint8Array(data.subarray(begin,end))))
    }
  }
  const assets=resolve('node_modules/pdfjs-dist'),task=getDocument({range:new Probe(),disableStream:true,disableAutoFetch:true,rangeChunkSize:size,verbosity:0,
    cMapUrl:`${assets}/cmaps/`,cMapPacked:true,standardFontDataUrl:`${assets}/standard_fonts/`,wasmUrl:`${assets}/wasm/`})
  const timer=setTimeout(()=>{void task.destroy()},30_000)
  try {
    const doc=await task.promise,page=await doc.getPage(1)
    await Promise.all([page.getOperatorList(),page.getTextContent(),page.getAnnotations(),page.getStructTree()])
    return chunks.size<=8?[...chunks].sort((a,b)=>a-b):[0,Math.floor((data.length-1)/size)].filter((v,i,a)=>a.indexOf(v)===i)
  } finally {clearTimeout(timer);await task.destroy()}
}
