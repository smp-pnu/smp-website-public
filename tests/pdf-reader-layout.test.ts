import {test} from 'node:test'
import assert from 'node:assert/strict'
import {pdfSpread,pdfPaperWidth,PDF_PAGE_GAP,PDF_ZOOM_LEVELS} from '../lib/pdf-reader-layout'

test('two-page navigation includes every page and handles a final unpaired page',()=>{
 for(const total of [1,2,12,27]){
  const seen:number[]=[]
  for(let page=1;page<=total;){const spread=pdfSpread(page,total,2);seen.push(...spread.pages);page=spread.end+1}
  assert.deepEqual(seen,Array.from({length:total},(_,i)=>i+1))
 }
 assert.deepEqual(pdfSpread(12,27,2).pages,[11,12])
 assert.deepEqual(pdfSpread(12,27,1).pages,[12])
 assert.deepEqual(pdfSpread(99,27,2).pages,[27])
 assert.deepEqual(pdfSpread(-5,27,2).pages,[1,2])
 assert.deepEqual(pdfSpread(1,0,2).pages,[])
})

test('both papers fit the viewport and reduced zoom levels stay available',()=>{
 for(const width of [320,390,1024,1920]){
  assert.ok(pdfPaperWidth(width,2)*2+PDF_PAGE_GAP<=width)
  assert.equal(pdfPaperWidth(width,1),width)
 }
 assert.ok(PDF_ZOOM_LEVELS.includes(.25));assert.ok(PDF_ZOOM_LEVELS.includes(.5));assert.ok(PDF_ZOOM_LEVELS.includes(.75))
})
