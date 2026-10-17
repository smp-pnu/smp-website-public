import {afterEach,test} from 'node:test'
import assert from 'node:assert/strict'
import {readerPreview,preparedReader,readerPdfMaxBytes} from '../lib/report-reader'
import {publicCover} from '../lib/public-cover'
import {selectReaderAssets,readerAssetBudget} from '../free/jobs/reader-assets'
import {readReaderAsset} from '../free/server/reader-asset'
import {readerPdf} from '../free/server/reader-pdf'
import {sourceKey} from '../lib/cover-metadata'
import type {ContentItem} from '../lib/content-model'
import type {Env} from '../free/server/types'
const id='a0000000000000000000000000000001',hash='a'.repeat(64),modified='Tue, 06 Oct 2026 04:50:46 GMT'
const item:ContentItem={id,kind:'research',title:'Reading copy',summary:'',date:'2026-10-01',category:'',author:'',pinned:false,attachments:[],externalUrl:'https://drive.google.com/file/d/reader-test-file/view',editedAt:'2026-10-01T00:00:00Z'}
const metadata=(report=id)=>({version:1 as const,pageCount:25,pages:[1,2,3].map(page=>({page,url:`/report-covers/${report}/${String(page).repeat(64)}.webp`,width:2048,height:2899})),pdf:{url:`/_reader-pdfs/${report}/${hash}.pdf`,bytes:100,sourceBytes:123,sourceModified:modified,checkedAt:Date.now()}})
test('reading metadata accepts only three consecutive owned images and bounded PDF assets',()=>{
  const value=metadata();assert.ok(preparedReader(id,value));assert.equal('pdf' in readerPreview(id,value)!,false)
  for(const changed of [{pages:[value.pages[0],value.pages[2]]},{pages:value.pages.map(p=>({...p,url:'https://outside.test/page.webp'}))},{pageCount:0},{pdf:{...value.pdf,bytes:readerPdfMaxBytes+1}},{pdf:{...value.pdf,url:`/_reader-pdfs/${'b'.repeat(32)}/${hash}.pdf`}},{pdf:{...value.pdf,sourceModified:'invalid'}}])assert.equal(preparedReader(id,{...value,...changed}),undefined)
  const cover=publicCover({...item,cover:{url:value.pages[0].url,reader:value}})!
  assert.equal('pdf' in cover.reader!,false)
})
test('optional PDF storage stays below both budgets and retains newest reports',()=>{
  const records=Array.from({length:40},(_,n)=>{const report=n.toString(16).padStart(32,'0');return {id:report,date:`2026-${String(n+1).padStart(2,'0')}`,cover:{reader:metadata(report)}}})
  const chosen=selectReaderAssets(records);assert.equal(chosen.length,readerAssetBudget.files);assert.equal(chosen[0].id,records[39].id)
  records.forEach(r=>{r.cover.reader.pdf.bytes=readerPdfMaxBytes})
  const large=selectReaderAssets(records);assert.ok(large.reduce((sum,a)=>sum+a.bytes,0)<=readerAssetBudget.bytes+readerAssetBudget.packBytes)
  assert.equal(large.length,10)
})
const originalFetch=global.fetch
afterEach(()=>{global.fetch=originalFetch})
function setup(){
  const value=metadata(),cover={reader:value,sourceKey:sourceKey(item),pdfHash:'c'.repeat(64)}
  let record:{body_revision:string;cover:string}|null={body_revision:item.editedAt!,cover:JSON.stringify(cover)},assetCalls=0,upstreamCalls=0
  const tasks:Promise<unknown>[]=[],proofs=new Map<string,Response>()
  const env={CMS_DB:{prepare:()=>({bind:()=>({first:async()=>record})})},ASSETS:{fetch:async(request:Request)=>{assetCalls++;const range=request.headers.get('range');return new Response('%PDF-'.padEnd(100,'x'),{status:200,headers:{'content-type':'application/pdf','content-length':'100'}})}}} as unknown as Env
  global.fetch=async()=>{upstreamCalls++;return new Response('%PDF-',{status:206,headers:{'content-type':'application/pdf','content-range':'bytes 0-4/123','content-length':'5','last-modified':modified}})}
  const ctx={waitUntil(p:Promise<unknown>){tasks.push(p)}}
  const cache={async match(key:Request){const value=proofs.get(key.url)?.clone();if(value && key.headers.has('range')){const bytes=await value.arrayBuffer();return new Response(bytes.slice(0,5),{status:206,headers:{'content-type':'application/pdf','content-length':'5','content-range':'bytes 0-4/100','accept-ranges':'bytes'}})}return value},async put(key:Request,response:Response){proofs.set(key.url,response)}}
  const read=(query='',headers?:HeadersInit,report=item)=>readerPdf(new Request(`https://fixture.test/api/content/research/${id}/pdf?source=external${query}`,{headers}),report,env,ctx,cache)
  return {value,cover,env,tasks,read,clear:()=>proofs.clear(),update:()=>{record={body_revision:item.editedAt!,cover:JSON.stringify(cover)}},remove:()=>{record=null},counts:()=>({assetCalls,upstreamCalls})}
}
test('prepared copy streams ranges; downloads and missing, stale or different sources fall back',async()=>{
  const s=setup(),response=(await s.read('',{range:'bytes=0-4'}))!
  assert.equal(response.status,206);assert.equal(await response.text(),'%PDF-');assert.equal(response.headers.get('content-length'),'5');assert.match(response.headers.get('cache-control')!,/private/)
  assert.equal(await s.read('&download=1'),undefined)
  assert.equal(await s.read('',undefined,{...item,editedAt:'new revision'}),undefined)
  assert.equal(await s.read('',undefined,{...item,externalUrl:'https://drive.google.com/file/d/another-report-file/view'}),undefined)
  assert.equal((await s.read('&prepared='+'b'.repeat(64)))?.status,404)
  assert.equal((await s.read('',{range:'bytes=0-4,10-14'}))?.status,416)
  s.clear();s.env.ASSETS.fetch=async()=>new Response(null,{status:404});assert.equal(await s.read(),undefined)
  s.remove();assert.equal(await s.read(),undefined)
})
test('expired source checks coalesce and reuse a five-minute proof; replacement is rejected',async()=>{
  const s=setup();s.value.pdf.checkedAt=1;s.update()
  const responses=await Promise.all([s.read(),s.read(),s.read()]);await Promise.all(responses.map(r=>r?.text()));await Promise.all(s.tasks)
  assert.equal(s.counts().upstreamCalls,1);assert.equal(s.counts().assetCalls,1)
  await (await s.read())?.text();assert.equal(s.counts().upstreamCalls,1);assert.equal(s.counts().assetCalls,1)
  // An independent report hash cannot inherit a proof from a prior version.
  s.cover.pdfHash='d'.repeat(64);s.update()
  global.fetch=async()=>new Response('%PDF-',{status:206,headers:{'content-type':'application/pdf','content-range':'bytes 0-4/999','content-length':'5','last-modified':'Wed, 07 Oct 2026 04:50:46 GMT'}})
  assert.equal(await s.read(),undefined)
  assert.equal((await s.read('&prepared='+hash))?.status,404)
})

test('an asset binding that ignores Range never advertises false range support without a working cache',async()=>{
 const s=setup(),req=new Request('https://fixture.test/api/report',{headers:{Range:'bytes=0-4'}})
 for(const cache of [undefined,{match:async()=>{throw Error('Cache unavailable')},put:async()=>{}}]){
  const response=(await readReaderAsset(req,s.value.pdf,s.env,cache))!
  assert.equal(response.status,200);assert.equal(response.headers.get('accept-ranges'),'none');assert.equal((await response.arrayBuffer()).byteLength,100)
 }
})

test('page packs are bounded, owned and exposed only as an opaque validated hint',()=>{
 const reader={...metadata(),pagePackVersion:1 as const,pagePack:{url:`/_reader-pdfs/${id}/${'e'.repeat(64)}.pack`,bytes:1000},pdf:{...metadata().pdf,chunkSize:1024*1024,initialChunks:[0]}}
 assert.ok(preparedReader(id,reader))
 const cover=publicCover({...item,cover:{url:reader.pages[0].url,reader}})!
 assert.deepEqual(cover.reader?.pack,{key:'e'.repeat(64),bytes:1000});assert.equal('pagePack' in cover.reader!,false)
 for(const change of [{pagePackVersion:3},{pageCount:121},{pagePack:{...reader.pagePack,bytes:25*1024*1024}},{pagePack:{...reader.pagePack,url:`/_reader-pdfs/${'f'.repeat(32)}/${hash}.pack`}}])assert.equal(preparedReader(id,{...reader,...change}),undefined)
 const records=Array.from({length:40},(_,i)=>{const report=i.toString(16).padStart(32,'0');return {id:report,date:String(i).padStart(2,'0'),cover:{reader:{...reader,pages:metadata(report).pages,pdf:{...reader.pdf,url:`/_reader-pdfs/${report}/${hash}.pdf`,bytes:24*1024*1024},pagePack:{...reader.pagePack,url:`/_reader-pdfs/${report}/${hash}.pack`,bytes:16*1024*1024}}}}})
 const selected=selectReaderAssets(records)
 assert.ok(selected.reduce((n,a)=>n+a.bytes+(a.pagePack?.bytes??0),0)<=readerAssetBudget.bytes+readerAssetBudget.packBytes)
 assert.ok(selected.reduce((n,a)=>n+(a.bytes?Math.ceil(a.bytes/(a.chunkSize??a.bytes)):0)+(a.pagePack?1:0),0)<=readerAssetBudget.assetFiles)
})

test('page pack endpoint uses the current source proof and rejects stale hashes, ranges and missing assets',async()=>{
 const s=setup(),pack={url:`/_reader-pdfs/${id}/${'e'.repeat(64)}.pack`,bytes:1000}
 Object.assign(s.value,{pagePack:pack,pagePackVersion:1});s.update()
 s.env.ASSETS.fetch=async(req)=>{assert.equal(new URL((req as Request).url).pathname,pack.url);return new Response(new Uint8Array(1000),{headers:{'Content-Type':'application/octet-stream','Content-Length':'1000'}})}
 const query=`&prepared=${hash}&pages=${'e'.repeat(64)}`
 const result=(await s.read(query))!;assert.equal(result.status,200);assert.equal((await result.arrayBuffer()).byteLength,1000);assert.match(result.headers.get('cache-control')!,/private/)
 s.env.ASSETS.fetch=async()=>new Response(new Uint8Array(1000))
 const untyped=(await s.read(query))!;assert.equal(untyped.status,200);assert.equal(untyped.headers.get('content-type'),'application/octet-stream');assert.equal((await untyped.arrayBuffer()).byteLength,1000)
 s.env.ASSETS.fetch=async()=>new Response('<html>Not found</html>',{headers:{'Content-Type':'text/html'}})
 assert.equal((await s.read(query))?.status,404)
 assert.equal((await s.read('&pages='+'e'.repeat(64)))?.status,404)
 assert.equal((await s.read(`&prepared=${hash}&pages=${'b'.repeat(64)}`))?.status,404)
 assert.equal((await s.read(query,{range:'bytes=0-4'}))?.status,416)
 assert.equal((await s.read(query,undefined,{...item,editedAt:'changed'}))?.status,404)
 assert.equal((await s.read(query,undefined,{...item,externalUrl:'https://drive.google.com/file/d/changed-file/view'}))?.status,404)
 s.env.ASSETS.fetch=async()=>{throw Error('Missing asset')};assert.equal((await s.read(query))?.status,404)
 s.remove();assert.equal((await s.read(query))?.status,404)
})

test('a large original can serve its bounded reading pack without an optimized PDF',async()=>{
 const s=setup(),pack={url:`/_reader-pdfs/${id}/${'e'.repeat(64)}.pack`,bytes:1000}
 const reader={...metadata(),pdf:undefined,pagePack:pack,pagePackVersion:2 as const,source:{key:'c'.repeat(64),bytes:70*1024*1024,modified,checkedAt:Date.now()}}
 assert.ok(preparedReader(id,reader))
 const view=publicCover({...item,cover:{url:reader.pages[0].url,reader}})!.reader!
 assert.equal(view.transport,undefined);assert.equal(view.packSource,'c'.repeat(64));assert.equal(view.pack?.key,'e'.repeat(64))
 Object.assign(s.cover,{reader});s.update()
 s.env.ASSETS.fetch=async()=>new Response(new Uint8Array(1000))
 const query=`&prepared=${'c'.repeat(64)}&pages=${'e'.repeat(64)}`
 assert.equal((await s.read(query))?.status,200)
 assert.equal(await s.read(),undefined)
 assert.equal((await s.read(query+'&download=1')),undefined)
 reader.source.checkedAt=1;s.update()
 // A changed original cannot inherit the saved reading edition.
 global.fetch=async()=>new Response('%PDF-',{status:206,headers:{'content-type':'application/pdf','content-range':'bytes 0-4/123','last-modified':modified}})
 assert.equal((await s.read(query))?.status,404)
 for(const source of [{...reader.source,key:'invalid'},{...reader.source,bytes:129*1024*1024},{...reader.source,modified:'invalid'},{...reader.source,checkedAt:0}])assert.equal(preparedReader(id,{...reader,source}),undefined)
 assert.equal(preparedReader(id,{...reader,source:undefined}),undefined)
})

test('reading editions are budgeted first, even when full PDFs would fill all storage',()=>{
 const records=Array.from({length:191},(_,i)=>{
  const report=i.toString(16).padStart(32,'0')
  return {id:report,date:String(i).padStart(2,'0'),cover:{reader:{...metadata(report),pdf:{...metadata(report).pdf,bytes:24*1024*1024},pagePack:{url:`/_reader-pdfs/${report}/${hash}.pack`,bytes:10*1024*1024}}}}
 })
 const selected=selectReaderAssets(records)
 assert.equal(selected.length,191);assert.equal(selected.filter(v=>v.pagePack).length,191)
 assert.ok(selected.some(v=>v.bytes===0));assert.ok(selected.reduce((n,v)=>n+v.bytes+(v.pagePack?.bytes??0),0)<=readerAssetBudget.bytes+readerAssetBudget.packBytes)
})

test('an evicted reading edition falls back without probing Drive',async()=>{
 const s=setup()
 Object.assign(s.value,{pagePack:{url:`/_reader-pdfs/${id}/${'e'.repeat(64)}.pack`,bytes:1000},pagePackVersion:1})
 s.value.pdf.checkedAt=1;s.update()
 s.env.ASSETS.fetch=async()=>new Response(null,{status:404})
 assert.equal((await s.read(`&prepared=${hash}&pages=${'e'.repeat(64)}`))?.status,404)
 assert.equal(s.counts().upstreamCalls,0)
})


test('storage overflow stops deployment instead of dropping old complete editions',()=>{
 const records=Array.from({length:180},(_,i)=>{
  const id=i.toString(16).padStart(32,'0')
  return {id,date:'2026',cover:{reader:{...metadata(id),pagePack:{url:`/_reader-pdfs/${id}/${hash}.pack`,bytes:24*1024*1024}}}}
 })
 assert.throws(()=>selectReaderAssets(records),/storage safety budget/)
 assert.ok(preparedReader(id,{...metadata(),pageCount:62,pagePack:{url:`/_reader-pdfs/${id}/${hash}.pack`,bytes:22*1024*1024}}))
})


test('a decade of 20 annual additions fits without evicting the current reading library',()=>{
 const records=Array.from({length:391},(_,i)=>{
  const id=i.toString(16).padStart(32,'0')
  return {id,date:String(i),cover:{reader:{...metadata(id),pagePack:{url:`/_reader-pdfs/${id}/${hash}.pack`,bytes:10*1024*1024}}}}
 })
 assert.equal(selectReaderAssets(records).filter(row=>row.pagePack).length,391)
})
