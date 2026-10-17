import { parsePdfContentRange } from './pdf-range'
import { readerPdfChunkBytes as size,type ReaderTransport } from './report-reader'

// At most four requests and eight initial chunks. Every request still passes
// through the publication/freshness API and is pinned to one prepared PDF hash.
export function createPdfRangeLoader(url:string,hint:ReaderTransport,onFailure:()=>void,fetcher:typeof fetch=fetch) {
  const controller=new AbortController(),pending=new Map<number,Promise<Uint8Array>>()
  const queue:{run:()=>void;reject:(reason:unknown)=>void}[]=[]
  let active=0,failed=false
  const pump=()=>{while(active<4 && queue.length && !controller.signal.aborted)queue.shift()!.run()}
  function chunk(index:number) {
    let value=pending.get(index);if(value)return value
    value=new Promise<Uint8Array>((resolve,reject)=>{
      const run=()=>{
        active++
        const start=index*size,end=Math.min(hint.bytes,(index+1)*size)-1
        const target=`${url}${url.includes('?')?'&':'?'}prepared=${hint.key}`
        void (async()=>{
          const response=await fetcher(target,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
          const range=parsePdfContentRange(response.headers.get('content-range'))
          if(response.status!==206 || response.headers.get('content-type')!=='application/pdf' || !range || range.start!==start || range.end!==end || range.total!==hint.bytes){await response.body?.cancel();throw Error('Prepared PDF changed or unavailable')}
          const bytes=new Uint8Array(await response.arrayBuffer())
          if(bytes.length!==end-start+1)throw Error('Incomplete PDF range')
          resolve(bytes)
        })().catch(reject).finally(()=>{active--;pump()})
      }
      if(controller.signal.aborted)reject(controller.signal.reason)
      else {queue.push({run,reject});pump()}
    })
    pending.set(index,value)
    void value.catch(()=>{if(!failed && !controller.signal.aborted){failed=true;onFailure()}})
    return value
  }
  return {
    prefetch(){for(const n of [hint.chunks[0],hint.chunks.at(-1)!,...hint.chunks.slice(1,-1)])void chunk(n)},
    async read(begin:number,end:number){
      if(!Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||begin<0||end<=begin||end>hint.bytes)throw Error('Invalid PDF range')
      const indexes=Array.from({length:Math.ceil(end/size)-Math.floor(begin/size)},(_,i)=>Math.floor(begin/size)+i)
      const values=await Promise.all(indexes.map(chunk))
      if(values.length===1 && begin%size===0 && end-begin===values[0].length){pending.delete(indexes[0]);return values[0]}
      const result=new Uint8Array(end-begin)
      let offset=0
      for(let i=0;i<values.length;i++){
        const from=Math.max(0,begin-indexes[i]*size),to=Math.min(values[i].length,end-indexes[i]*size)
        result.set(values[i].subarray(from,to),offset);offset+=to-from
        pending.delete(indexes[i])
      }
      return result
    },
    abort(){controller.abort();for(const entry of queue.splice(0))entry.reject(controller.signal.reason);pending.clear()},
  }
}
