import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reportExcerpt,validReportExcerpt,withReportExcerpt} from '../lib/report-excerpt'
import {blockHtml} from '../free/seo/content'

const prose='이 자료는 기업의 사업 구조와 실적을 분석한 학회 리포트입니다. 성장 요인과 위험 요인은 원문 전체의 맥락을 함께 확인해야 합니다.\n'.repeat(40)
test('PDF source excerpts are bounded, preserve readable lines and reject sparse image-only text',()=>{
  const excerpt=reportExcerpt([prose,'123 456 \ufffd',prose])
  assert.equal(excerpt.pages.length,1);assert.equal(excerpt.pages[0].number,1)
  assert.ok(excerpt.pages[0].text.length<=2400);assert.match(excerpt.pages[0].text,/\n/)
  assert.ok(validReportExcerpt(excerpt));assert.ok(validReportExcerpt({version:2,pages:[]}))
  for(const value of [null,{version:99,pages:[]},{version:2,pages:[{number:3,text:prose}]},{version:2,pages:[{number:1,text:prose}]}]) assert.equal(validReportExcerpt(value),false)
})
test('source excerpts fill only empty bodies and never overwrite authored text or nested blocks',()=>{
  const excerpt=reportExcerpt([prose])
  const generated=withReportExcerpt('test',[],excerpt)
  assert.equal(generated[0].type,'toggle');assert.match(blockHtml(generated),/PDF 원문 발췌/)
  for(const body of [
    [{id:'p',type:'paragraph',paragraph:{rich_text:[{plain_text:'작성자가 입력한 본문'}]}}],
    [{id:'p',type:'paragraph',paragraph:{rich_text:[]},children:[{id:'nested',type:'paragraph',paragraph:{rich_text:[{plain_text:'본문'}]}}]}],
    [{id:'i',type:'image',image:{external:{url:'https://pnusmp.com/photo.webp'}}}],
  ]) assert.equal(withReportExcerpt('test',body,excerpt),body)
  assert.deepEqual(withReportExcerpt('test',[],{version:2,pages:[]}),[])
  assert.doesNotMatch(blockHtml(withReportExcerpt('test',[],reportExcerpt([prose+'<script>alert(1)</script>']))),/<script>/)
})

test('excerpts start at source prose rather than axes and omit contents-only pages',()=>{
 const excerpt=reportExcerpt(['200\n400\n600\nInBody KOSDAQ\n팀장 SMP\n'+prose,'01 산업분석 05\n02 기업개요 09\nCONTENTS'])
 assert.equal(excerpt.pages.length,1)
 assert.ok(excerpt.pages[0].text.startsWith('이 자료는 기업의 사업 구조'))
 assert.doesNotMatch(excerpt.pages[0].text,/200|InBody/)
})
