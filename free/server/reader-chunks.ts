import { readerPdfParts, type ReaderPdf } from "../../lib/report-reader"
import { parsePdfRange, resolvePdfRange } from "../../lib/pdf-range"
import { Busy, type Env } from "./types"

let activeSlices=0

// Immutable 1 MiB assets do not need a complete-PDF cache fill. Only the first
// required part is awaited; remaining aligned parts pipe natively with backpressure.
// The sole JS slice is bounded to the two partial edge parts of a byte range.
export async function readReaderChunks(request:Request,pdf:ReaderPdf,env:Env):Promise<Response|undefined> {
  const range=request.headers.get("range"),parsed=range?parsePdfRange(range):null
  if(range && !parsed)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${pdf.bytes}`}})
  const {start,end}=parsed?resolvePdfRange(parsed,pdf.bytes):{start:0,end:pdf.bytes-1}
  if(start>=pdf.bytes)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${pdf.bytes}`}})
  const parts=readerPdfParts(pdf).filter(p=>p.start<=end && p.start+p.bytes>start)
  const abort=new AbortController()
  const signal=AbortSignal.any([request.signal,abort.signal])
  async function read(part:typeof parts[number]) {
    const response=await env.ASSETS.fetch(new Request(new URL(part.url,request.url),{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])}))
    const length=response.headers.get("content-length"),type=response.headers.get("content-type")?.split(";")[0]
    if(response.status!==200 || !response.body || !["application/octet-stream","application/pdf"].includes(type??"") || (length!==null && Number(length)!==part.bytes)) {
      await response.body?.cancel();throw Error("Prepared PDF part unavailable")
    }
    const from=Math.max(0,start-part.start),to=Math.min(part.bytes,end-part.start+1)
    if(from===0 && to===part.bytes)return response.body
    // Normal viewer requests align with 1 MiB assets and never enter this path.
    // Bound concurrent JS buffers for arbitrary suffix/unaligned HTTP clients.
    if(activeSlices>=4){await response.body.cancel();throw new Busy(1)}
    activeSlices++
    try {
      const bytes=await response.arrayBuffer()
      if(bytes.byteLength!==part.bytes)throw Error("Invalid prepared PDF part")
      return new Response(bytes.slice(from,to)).body!
    } finally {activeSlices--}
  }
  let first:ReadableStream<Uint8Array>
  try {first=await read(parts[0])}catch(error){if(error instanceof Busy)throw error;return}
  const Native=(globalThis as unknown as {FixedLengthStream?:new(length:number)=>TransformStream<Uint8Array,Uint8Array>}).FixedLengthStream
  const stream=Native?new Native(end-start+1):new TransformStream<Uint8Array,Uint8Array>()
  void (async()=>{
    try {
      await first.pipeTo(stream.writable,{preventClose:true})
      for(const part of parts.slice(1))await (await read(part)).pipeTo(stream.writable,{preventClose:true})
      await stream.writable.getWriter().close()
    } catch(error) {abort.abort();await stream.writable.abort(error).catch(()=>{})}
  })()
  return new Response(stream.readable,{status:parsed?206:200,headers:{
    "Content-Type":"application/pdf","Content-Length":String(end-start+1),"Accept-Ranges":"bytes",
    ...(parsed?{"Content-Range":`bytes ${start}-${end}/${pdf.bytes}`}:{})
  }})
}
