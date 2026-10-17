import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {encodePagePack,decodePagePack,pagePackMaxBytes} from '../lib/pdf-page-pack'
import {createPagePackLoader} from '../lib/pdf-page-pack-loader'
const image=new TextEncoder().encode('RIFF1234WEBPimage')
const pages=[1,2,3].map(page=>({page,width:2048,height:2899,data:image}))
const bytes=encodePagePack(pages),key=createHash('sha256').update(bytes).digest('hex'),pdfKey='a'.repeat(64)
const response=()=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}})

test('page pack rejects corrupt headers, offsets, image types, count and budget violations',()=>{
 assert.deepEqual(decodePagePack(bytes,3),pages)
 assert.throws(()=>decodePagePack(bytes,2))
 assert.throws(()=>decodePagePack(new Uint8Array(pagePackMaxBytes+1),3))
 for(const position of [0,8,12,bytes.length-16]){const broken=bytes.slice();broken[position]^=255;assert.throws(()=>decodePagePack(broken,3))}
 for(const changed of [{page:2},{width:0},{height:5000},{data:new Uint8Array(16)}])assert.throws(()=>encodePagePack([{...pages[0],...changed}]))
 assert.throws(()=>decodePagePack(new Uint8Array([...bytes,0]),3))
})

test('all page reads and resized views share one bounded request; each image URL has its own lifecycle',async()=>{
 let calls=0
 const loader=createPagePackLoader('/pdf?source=external',pdfKey,{key,bytes:bytes.length},3,async(url)=>{
  calls++;assert.equal(String(url),`/pdf?source=external&prepared=${pdfKey}&pages=${key}`);return response()
 })
 const signal=new AbortController().signal
 const entries=await Promise.all([1,2,3,1].map(page=>loader.read(page,signal)))
 assert.equal(calls,1);assert.equal(entries[0]?.width,2048);assert.equal(entries[0]?.bytes,image.length)
 assert.notEqual(entries[0]?.url,entries[3]?.url)
 entries.forEach(entry=>URL.revokeObjectURL(entry!.url));loader.dispose()
 await assert.rejects(loader.read(1,signal))
})

test('missing, mismatched, truncated and oversized packs fall back without repeated requests',async()=>{
 for(const factory of [()=>new Response(null,{status:404}),()=>new Response(bytes),()=>new Response(bytes.slice(0,-1),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}}),()=>new Response(new Uint8Array([...bytes,0]),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}}),()=>new Response(bytes.map((b,i)=>i===bytes.length-1?0:b),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)}})]){
  let calls=0;const loader=createPagePackLoader('/pdf',pdfKey,{key,bytes:bytes.length},3,async()=>{calls++;return factory()})
  assert.equal(await loader.read(1,new AbortController().signal),undefined)
  assert.equal(await loader.read(2,new AbortController().signal),undefined);assert.equal(calls,1);loader.dispose()
 }
})

test('resizing cancels only the obsolete view; disposing cancels the shared download',async()=>{
 let finish!:(value:Response)=>void
 const loader=createPagePackLoader('/pdf',pdfKey,{key,bytes:bytes.length},3,()=>new Promise(resolve=>finish=resolve))
 const oldView=new AbortController(),first=loader.read(1,oldView.signal)
 oldView.abort();const next=loader.read(1,new AbortController().signal);finish(response())
 await assert.rejects(first);const entry=await next;assert.ok(entry);URL.revokeObjectURL(entry.url);loader.dispose()
 const stopped=new AbortController();stopped.abort()
 await assert.rejects(loader.read(1,stopped.signal))
})

test('the lightweight reader obtains every page with one request and no PDF parser',async()=>{
 let calls=0;const loader=createPagePackLoader('/pdf',pdfKey,{key,bytes:bytes.length},3,async()=>{calls++;return response()})
 const all=await loader.readAll(new AbortController().signal)
 assert.deepEqual(all?.map(v=>v.page),[1,2,3]);assert.equal(calls,1)
 const another=await loader.readAll(new AbortController().signal)
 assert.equal(calls,1);assert.notEqual(all?.[0].url,another?.[0].url)
 for(const entry of [...all!,...another!])URL.revokeObjectURL(entry.url)
 loader.dispose()
 await assert.rejects(loader.readAll(new AbortController().signal))
})


test('long reports retain all 62 pages in a single bounded pack',()=>{
 const pages=Array.from({length:62},(_,i)=>({page:i+1,width:2048,height:2899,data:image}))
 const packed=encodePagePack(pages)
 assert.equal(decodePagePack(packed,62).at(-1)!.page,62)
 assert.throws(()=>encodePagePack(Array.from({length:121},(_,i)=>({...pages[0],page:i+1}))))
})
