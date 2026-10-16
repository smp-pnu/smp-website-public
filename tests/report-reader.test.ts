import {afterEach,test} from 'node:test'
import assert from 'node:assert/strict'
import {readerPreview,preparedReader,readerPdfMaxBytes} from '../lib/report-reader'
import {publicCover} from '../lib/public-cover'
import {selectReaderAssets,readerAssetBudget} from '../free/jobs/reader-assets'
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
  const large=selectReaderAssets(records);assert.ok(large.reduce((sum,a)=>sum+a.bytes,0)<=readerAssetBudget.bytes)
  assert.equal(large.length,21)
})
const originalFetch=global.fetch
afterEach(()=>{global.fetch=originalFetch})
function setup(){
  const value=metadata(),cover={reader:value,sourceKey:sourceKey(item),pdfHash:'c'.repeat(64)}
  let record:{body_revision:string;cover:string}|null={body_revision:item.editedAt!,cover:JSON.stringify(cover)},assetCalls=0,upstreamCalls=0
  const tasks:Promise<unknown>[]=[],proofs=new Map<string,Response>()
  const env={CMS_DB:{prepare:()=>({bind:()=>({first:async()=>record})})},ASSETS:{fetch:async(request:Request)=>{assetCalls++;const range=request.headers.get('range');return new Response(range?'%PDF-':'%PDF-prepared',{status:range?206:200,headers:{'content-type':'application/pdf','content-length':range?'5':'13',...(range?{'content-range':'bytes 0-4/100'}:{})}})}}} as unknown as Env
  global.fetch=async()=>{upstreamCalls++;return new Response('%PDF-',{status:206,headers:{'content-type':'application/pdf','content-range':'bytes 0-4/123','content-length':'5','last-modified':modified}})}
  const ctx={waitUntil(p:Promise<unknown>){tasks.push(p)}}
  const cache={async match(key:Request){return proofs.get(key.url)?.clone()},async put(key:Request,response:Response){proofs.set(key.url,response)}}
  const read=(query='',headers?:HeadersInit,report=item)=>readerPdf(new Request(`https://fixture.test/api/content/research/${id}/pdf?source=external${query}`,{headers}),report,env,ctx,cache)
  return {value,cover,env,tasks,read,update:()=>{record={body_revision:item.editedAt!,cover:JSON.stringify(cover)}},remove:()=>{record=null},counts:()=>({assetCalls,upstreamCalls})}
}
test('prepared copy streams ranges; downloads and missing, stale or different sources fall back',async()=>{
  const s=setup(),response=(await s.read('',{range:'bytes=0-4'}))!
  assert.equal(response.status,206);assert.equal(await response.text(),'%PDF-');assert.equal(response.headers.get('content-length'),'5');assert.match(response.headers.get('cache-control')!,/private/)
  assert.equal(await s.read('&download=1'),undefined)
  assert.equal(await s.read('',undefined,{...item,editedAt:'new revision'}),undefined)
  assert.equal(await s.read('',undefined,{...item,externalUrl:'https://drive.google.com/file/d/another-report-file/view'}),undefined)
  assert.equal((await s.read('&prepared='+'b'.repeat(64)))?.status,404)
  assert.equal((await s.read('',{range:'bytes=0-4,10-14'}))?.status,416)
  s.env.ASSETS.fetch=async()=>new Response(null,{status:404});assert.equal(await s.read(),undefined)
  s.remove();assert.equal(await s.read(),undefined)
})
test('expired source checks coalesce and reuse a five-minute proof; replacement is rejected',async()=>{
  const s=setup();s.value.pdf.checkedAt=1;s.update()
  const responses=await Promise.all([s.read(),s.read(),s.read()]);await Promise.all(responses.map(r=>r?.text()));await Promise.all(s.tasks)
  assert.equal(s.counts().upstreamCalls,1)
  await (await s.read())?.text();assert.equal(s.counts().upstreamCalls,1)
  // An independent report hash cannot inherit a proof from a prior version.
  s.cover.pdfHash='d'.repeat(64);s.update()
  global.fetch=async()=>new Response('%PDF-',{status:206,headers:{'content-type':'application/pdf','content-range':'bytes 0-4/999','content-length':'5','last-modified':'Wed, 07 Oct 2026 04:50:46 GMT'}})
  assert.equal(await s.read(),undefined)
  assert.equal((await s.read('&prepared='+hash))?.status,404)
})
