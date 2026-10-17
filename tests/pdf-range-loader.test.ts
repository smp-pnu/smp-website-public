import {test}from'node:test'
import assert from'node:assert/strict'
import{createPdfRangeLoader}from'../lib/pdf-range-loader'
import{readerPdfChunkBytes as size,type ReaderTransport}from'../lib/report-reader'
const hint:ReaderTransport={key:'a'.repeat(64),bytes:size*6+35,chunks:[0,1,3,4,6]}
test('initial PDF byte reads overlap with at most four requests and reuse prefetch without a full download',async()=>{
 let active=0,max=0,failures=0;const calls:{start:number;end:number}[]=[],releases:(()=>void)[]=[]
 const fetcher=async(url:RequestInfo|URL,init?:RequestInit)=>{
  assert.match(String(url),/prepared=a{64}$/);const range=/bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('range')!)!;const start=Number(range[1]),end=Number(range[2]);calls.push({start,end});active++;max=Math.max(max,active)
  await new Promise<void>(resolve=>releases.push(resolve));active--
  return new Response(new Uint8Array(end-start+1).fill(Math.floor(start/size)),{status:206,headers:{'Content-Type':'application/pdf','Content-Range':`bytes ${start}-${end}/${hint.bytes}`}})
 }
 const loader=createPdfRangeLoader('/api/pdf?source=external',hint,()=>failures++,fetcher)
 loader.prefetch();assert.equal(calls.length,4);assert.deepEqual(calls.slice(0,2).map(c=>c.start),[0,6*size])
 const first=loader.read(0,size);assert.equal(calls.length,4)
 releases.shift()!();assert.equal((await first).length,size);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,5)
 while(releases.length)releases.shift()!()
 const boundary=await loader.read(size*3+size-7,size*4+9);assert.deepEqual([...boundary],[...Array(7).fill(3),...Array(9).fill(4)])
 assert.equal(max,4);assert.equal(failures,0);assert.ok(calls.every(c=>c.end-c.start<size));loader.abort()
})
test('changed PDF sizes and missing prepared copies cause a bounded fallback; abort cancels queued prefetch',async()=>{
 let failures=0,calls=0
 const loader=createPdfRangeLoader('/api/pdf',hint,()=>failures++,async()=>{calls++;return new Response('x',{status:206,headers:{'Content-Type':'application/pdf','Content-Range':'bytes 0-0/1'}})})
 await assert.rejects(loader.read(0,size),/changed/);assert.equal(failures,1);assert.equal(calls,1);loader.abort()
 let aborted=0;calls=0
 const pending=createPdfRangeLoader('/api/pdf',hint,()=>failures++,async(_u,init)=>{calls++;await new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>{aborted++;reject(Error('aborted'))},{once:true}));throw Error('unreachable')})
 pending.prefetch();pending.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,4);assert.equal(aborted,4);assert.equal(failures,1)
})

test('whole-document warmup batches adjacent missing chunks without repeating prefetched data',async()=>{
 const calls:{start:number;end:number}[]=[],data=new Uint8Array(size*10+35)
 for(let i=0;i<data.length;i++)data[i]=Math.floor(i/size)
 const loader=createPdfRangeLoader('/api/pdf',{...hint,bytes:data.length,chunks:[0,10]},()=>assert.fail('unexpected fallback'),async(_url,init)=>{
  const [,a,b]=/bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('range')!)!,start=Number(a),end=Number(b);calls.push({start,end})
  return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'application/pdf','Content-Range':`bytes ${start}-${end}/${data.length}`}})
 })
 loader.prefetch()
 assert.deepEqual(await loader.read(0,data.length),data)
 assert.equal(calls.length,5) // two priority chunks + three grouped ranges
 assert.equal(calls.reduce((n,c)=>n+c.end-c.start+1,0),data.length)
 assert.ok(calls.every(c=>c.end-c.start+1<=4*size))
 loader.abort()
})
