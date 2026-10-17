import {test} from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import {prepareCover} from '../free/jobs/prepare'
import type {ContentItem} from '../lib/content-model'

const id='a0000000000000000000000000000001'
const item={id,kind:'research',title:'PDF reuse',attachments:[],externalUrl:'https://drive.google.com/file/d/fixture-report-123/view'} as unknown as ContentItem
test('same PDF bytes reuse the cover and all three reading pages and never extract text into a website excerpt',async()=>{
  let renders=0,saves=0,downloads=0
  let bytes=new TextEncoder().encode('%PDF-original')
  const png=await sharp({create:{width:2048,height:2899,channels:3,background:'#ffffff'}}).png().toBuffer()
  const deps={download:async()=>{downloads++;return {data:bytes,lastModified:"Tue, 06 Oct 2026 04:50:46 GMT"}},render:async()=>{renders++;return {pageCount:25,pages:[1,2,3].map(page=>({page,png,width:2048,height:2899}))}},save:async(report:string,data:Uint8Array)=>{saves++;return `/report-covers/${report}/${createHash('sha256').update(data).digest('hex')}.webp`},optimize:async()=>undefined}
  const first=await prepareCover(item,null,deps)
  assert.ok(first?.pdfHash)
  assert.equal(renders,1);assert.equal(saves,4)
  const second=await prepareCover({...item,title:'Renamed',editedAt:'2026-10-11'},first,deps)
  assert.deepEqual(second,first)
  const moved=await prepareCover({...item,externalUrl:'https://drive.google.com/file/d/fixture-report-456/view'},first,deps)
  assert.equal(moved?.pdfHash,first.pdfHash);assert.equal(moved?.url,first.url);assert.notEqual(moved?.sourceKey,first.sourceKey)
  assert.equal(renders,1);assert.equal(saves,4);assert.equal(downloads,3)
  const legacy=Object.assign({},first,{excerpt:{version:2,pages:[{number:1,text:'오래된 자동 발췌'}]}})
  const reused=await prepareCover(item,legacy,deps)
  assert.deepEqual(reused,first)
  assert.equal('excerpt' in (reused??{}),false)
  assert.equal(renders,1);assert.equal(downloads,4)
  bytes=new TextEncoder().encode('%PDF-replaced-behind-same-link')
  const changed=await prepareCover(item,first,deps)
  assert.notEqual(changed?.pdfHash,first.pdfHash)
  assert.equal(renders,2);assert.equal(saves,8)
  assert.equal(await prepareCover({...item,externalUrl:null},first,deps),null)
})
test('failed PDF verification and foreign image paths never reuse an unverified cover',async()=>{
  const data=new TextEncoder().encode('%PDF-test')
  const foreign={url:`/report-covers/${'f'.repeat(32)}/${'a'.repeat(64)}.webp`,previewUrl:'/foreign.webp',width:2048,height:2899,pdfHash:createHash('sha256').update(data).digest('hex')}
  await assert.rejects(prepareCover(item,foreign,{download:async()=>{throw Error('Source unavailable')},render:async()=>{throw Error('Must not render')},save:async()=>'',optimize:async()=>undefined}),/Source unavailable/)
  await assert.rejects(prepareCover(item,foreign,{download:async()=>({data,lastModified:null}),render:async()=>{throw Error('Render required')},save:async()=>'',optimize:async()=>undefined}),/Render required/)
})
test('optional optimization failure keeps first pages and the original reader available',async()=>{
  const png=await sharp({create:{width:64,height:90,channels:3,background:'#fff'}}).png().toBuffer()
  const cover=await prepareCover(item,null,{download:async()=>({data:new TextEncoder().encode('%PDF-fallback'),lastModified:'Tue, 06 Oct 2026 04:50:46 GMT'}),render:async()=>({pageCount:1,pages:[{page:1,png,width:64,height:90}]}),save:async(report,data)=>`/report-covers/${report}/${createHash('sha256').update(data).digest('hex')}.webp`,optimize:async()=>{throw Error('Optional tool unavailable')}})
  assert.equal(cover?.reader?.pages.length,1);assert.equal(cover?.reader?.pdf,undefined)
})
test('unchanged optimized PDFs retain their first-page map without re-optimizing or re-rendering',async()=>{
 const png=await sharp({create:{width:64,height:90,channels:3,background:'#fff'}}).png().toBuffer();let optimized=0,renders=0
 const deps={download:async()=>({data:new TextEncoder().encode('%PDF-stable'),lastModified:'Tue, 06 Oct 2026 04:50:46 GMT'}),render:async()=>{renders++;return {pageCount:1,pages:[{page:1,png,width:64,height:90}]}},save:async(report:string,data:Uint8Array)=>`/report-covers/${report}/${createHash('sha256').update(data).digest('hex')}.webp`,optimize:async()=>{optimized++;return {url:`/_reader-pdfs/${id}/${'f'.repeat(64)}.pdf`,bytes:11,chunkSize:1024*1024,initialChunks:[0]}}}
 const first=await prepareCover(item,null,deps),second=await prepareCover(item,first,deps)
 assert.equal(optimized,1);assert.equal(renders,1);assert.deepEqual(second?.reader?.pdf?.initialChunks,[0]);assert.equal(second?.url,first?.url)
})

test('page packs reuse the verified PDF, regenerate on replacement and remain optional',async()=>{
 const png=await sharp({create:{width:64,height:90,channels:3,background:'#fff'}}).png().toBuffer()
 let data=new TextEncoder().encode('%PDF-one'),seenPrevious:unknown[]=[]
 const asset={url:`/_reader-pdfs/${id}/${'e'.repeat(64)}.pack`,bytes:1000}
 const deps={download:async()=>({data,lastModified:'Tue, 06 Oct 2026 04:50:46 GMT'}),render:async()=>({pageCount:1,pages:[{page:1,png,width:64,height:90}]}),save:async(report:string,bytes:Uint8Array)=>`/report-covers/${report}/${createHash('sha256').update(bytes).digest('hex')}.webp`,optimize:async()=>({url:`/_reader-pdfs/${id}/${'f'.repeat(64)}.pdf`,bytes:11,chunkSize:1024*1024,initialChunks:[0]}),pack:async(_id:string,_data:Uint8Array,previous?:typeof asset)=>{seenPrevious.push(previous);return asset}}
 const first=await prepareCover(item,null,deps),again=await prepareCover(item,first,deps)
 assert.deepEqual(again?.reader?.pagePack,asset);assert.deepEqual(seenPrevious,[undefined,asset])
 data=new TextEncoder().encode('%PDF-replaced')
 const changed=await prepareCover(item,again,{...deps,pack:async()=>{throw Error('Optional timeout')}})
 assert.equal(changed?.reader?.pagePack,undefined);assert.equal(changed?.reader?.pagePackVersion,1)
 assert.equal(changed?.reader?.pages.length,1);assert.ok(changed?.reader?.pdf)
})
