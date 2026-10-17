import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readReaderChunks} from '../free/server/reader-chunks'
import {readerPdfChunkBytes as chunk,readerPdfChunkedMaxBytes,readerPdfParts,preparedReader} from '../lib/report-reader'
import {publicCover} from '../lib/public-cover'
import type {Env} from '../free/server/types'
import type {ContentItem} from '../lib/content-model'

const id='a0000000000000000000000000000001',hash='f'.repeat(64)
const data=Uint8Array.from({length:chunk*2+117},(_,i)=>i%251)
const pdf={url:`/_reader-pdfs/${id}/${hash}.pdf`,bytes:data.length,chunkSize:chunk,sourceBytes:data.length,sourceModified:'Sat, 03 Oct 2026 12:27:21 GMT',checkedAt:Date.now()}
function setup(){
 const calls:string[]=[]
 const env={ASSETS:{async fetch(req:Request){calls.push(new URL(req.url).pathname);const part=readerPdfParts(pdf).find(p=>p.url===new URL(req.url).pathname);return part?new Response(data.subarray(part.start,part.start+part.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(part.bytes)}}):new Response(null,{status:404})}}} as unknown as Env
 return {env,calls,read:(range?:string)=>readReaderChunks(new Request('https://fixture.test/api/pdf',{headers:range?{Range:range}:{}}),pdf,env)}
}
test('prepared ranges fetch only needed immutable parts and remain byte exact at boundaries',async()=>{
 for(const [range,start,end,count] of [[`bytes=0-${chunk-1}`,0,chunk-1,1],[`bytes=${chunk-13}-${chunk+29}`,chunk-13,chunk+29,2],['bytes=-51',data.length-51,data.length-1,1],[`bytes=${chunk*2}-`,chunk*2,data.length-1,1]] as const){
  const s=setup(),r=(await s.read(range))!;assert.equal(r.status,206)
  assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${data.length}`)
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()),data.subarray(start,end+1));assert.equal(s.calls.length,count)
 }
})
test('whole PDF starts after one part and native piping reconstructs the exact document',async()=>{
 const s=setup(),r=(await s.read())!;assert.equal(s.calls.length,1,'must not await the complete file')
 assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),String(data.length))
 assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),createHash('sha256').update(data).digest('hex'))
 assert.equal(s.calls.length,3)
})
test('cancelling the initial stream stops remaining parts; unavailable or invalid parts fail closed',async()=>{
 const s=setup(),r=(await s.read())!;await r.body!.cancel();await new Promise(resolve=>setImmediate(resolve));assert.ok(s.calls.length<=2,'cancellation may race one in-flight part, but must not fetch the whole document')
 for(const range of ['bytes=0-1,5-6',`bytes=${data.length}-`])assert.equal((await s.read(range))?.status,416)
 s.env.ASSETS.fetch=async()=>new Response('<html>not a PDF</html>',{headers:{'Content-Type':'text/html'}});assert.equal(await s.read(),undefined)
})
test('large prepared documents are bounded by total size and fixed part size; public metadata reveals only the mode',()=>{
 const reader={version:1 as const,pageCount:27,pages:[1,2,3].map(page=>({page,url:`/report-covers/${id}/${hash}.webp`,width:2048,height:2899})),pdf:{...pdf,bytes:28_639_256}}
 assert.ok(preparedReader(id,reader));assert.equal(readerPdfParts(reader.pdf).length,28)
 for(const change of [{bytes:readerPdfChunkedMaxBytes+1},{chunkSize:128*1024*1024},{chunkSize:undefined}])assert.equal(preparedReader(id,{...reader,pdf:{...reader.pdf,...change}}),undefined)
 const cover=publicCover({id,kind:'research',cover:{url:reader.pages[0].url,reader}} as unknown as ContentItem)!
 assert.equal(cover.reader?.rangeOnly,true);assert.equal('pdf' in cover.reader!,false)
})
test('first-page hints are bounded, ordered, and only expose an owned content hash',()=>{
 const reader={version:1 as const,pageCount:1,pages:[{page:1,url:`/report-covers/${id}/${hash}.webp`,width:2048,height:2899}],pdf:{...pdf,initialChunks:[0,2]}}
 const cover=publicCover({id,kind:'research',cover:{url:reader.pages[0].url,reader}} as unknown as ContentItem)!
 assert.deepEqual(cover.reader?.transport,{key:hash,bytes:pdf.bytes,chunks:[0,2]})
 for(const initialChunks of [[],[1],[0,0],[0,2,1],[0,3],[0,-1],Array.from({length:9},(_,n)=>n)])assert.equal(preparedReader(id,{...reader,pdf:{...reader.pdf,initialChunks}}),undefined)
})
