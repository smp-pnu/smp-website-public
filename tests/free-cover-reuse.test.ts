import {test} from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import {prepareCover} from '../free/jobs/prepare'
import type {ContentItem} from '../lib/content-model'

const id='a0000000000000000000000000000001'
const item={id,kind:'research',title:'PDF reuse',attachments:[],externalUrl:'https://drive.google.com/file/d/fixture-report-123/view'} as unknown as ContentItem
test('same PDF bytes reuse both images across edits, re-publication and a changed Drive link',async()=>{
  let renders=0,saves=0
  let bytes=new TextEncoder().encode('%PDF-original')
  const png=await sharp({create:{width:2048,height:2899,channels:3,background:'#ffffff'}}).png().toBuffer()
  const deps={download:async()=>bytes,render:async()=>{renders++;return png},save:async(report:string,data:Uint8Array)=>{saves++;return `/report-covers/${report}/${createHash('sha256').update(data).digest('hex')}.webp`}}
  const first=await prepareCover(item,null,deps)
  assert.ok(first?.pdfHash)
  assert.equal(renders,1);assert.equal(saves,2)
  const second=await prepareCover({...item,title:'Renamed',editedAt:'2026-10-11'},first,deps)
  assert.deepEqual(second,first)
  const moved=await prepareCover({...item,externalUrl:'https://drive.google.com/file/d/fixture-report-456/view'},first,deps)
  assert.equal(moved?.pdfHash,first.pdfHash);assert.equal(moved?.url,first.url);assert.notEqual(moved?.sourceKey,first.sourceKey)
  assert.equal(renders,1);assert.equal(saves,2)
  bytes=new TextEncoder().encode('%PDF-replaced-behind-same-link')
  const changed=await prepareCover(item,first,deps)
  assert.notEqual(changed?.pdfHash,first.pdfHash)
  assert.equal(renders,2);assert.equal(saves,4)
  assert.equal(await prepareCover({...item,externalUrl:null},first,deps),null)
})
test('failed PDF verification and foreign image paths never reuse an unverified cover',async()=>{
  const data=new TextEncoder().encode('%PDF-test')
  const foreign={url:`/report-covers/${'f'.repeat(32)}/${'a'.repeat(64)}.webp`,previewUrl:'/foreign.webp',width:2048,height:2899,pdfHash:createHash('sha256').update(data).digest('hex')}
  await assert.rejects(prepareCover(item,foreign,{download:async()=>{throw Error('Source unavailable')},render:async()=>{throw Error('Must not render')},save:async()=>''}),/Source unavailable/)
  await assert.rejects(prepareCover(item,foreign,{download:async()=>data,render:async()=>{throw Error('Render required')},save:async()=>''}),/Render required/)
})
