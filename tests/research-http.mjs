// Local production server preloaded with tests/research-fixture.mjs only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const base = 'http://127.0.0.1:3210'
const stats = process.env.SMP_TEST_STATS
if (!stats) throw new Error('Set SMP_TEST_STATS to the local fixture request log')
const queries = async () => (await readFile(stats, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(row => row.path.includes('/data_sources/')).length
const condition = new URLSearchParams({q:'041830',semester:'2026-2',industry:'헬스케어',reportType:'기업분석',activity:'정규 세션',view:'list'})
const response = await fetch(`${base}/research?${condition}`)
assert.equal(response.status,200)
const html=await response.text()
assert.ok(html.includes('총 <!-- -->12<!-- -->건'))
assert.ok(html.includes('041830'))
assert.ok(!html.includes('data-card-grid'))
const before = await queries()
await Promise.all(Array.from({length:20},async(_,index)=>{
  const r=await fetch(`${base}/research?${condition}&page=${index%2+1}`)
  assert.equal(r.status,200)
  await r.text()
}))
// A warm response can start one background refresh at the 60-second TTL.
// 600 fixture reports require six pages; 20 URLs must not run 20 scans.
assert.ok(await queries() - before <= 6,'Filter and view URLs must share one catalog refresh')
const noMatch = new URLSearchParams(condition)
noMatch.set('q','없는기업')
const empty=await (await fetch(`${base}/research?${noMatch}`)).text()
assert.ok(empty.includes('검색 결과가 없습니다.'))
const index=await (await fetch(`${base}/api/search`)).json()
assert.ok(index.entries.some(entry=>entry.label==='리포트'&&entry.text.includes('041830')))
assert.ok(!JSON.stringify(index).includes('drive.google.com'))
const detail=await (await fetch(`${base}/research/a0000000000000000000000000000005?${condition}`)).text()
assert.ok(detail.includes('Not Rated'))
assert.ok(detail.includes('같은 기업의 리포트'))
assert.ok(detail.includes('투자 포인트'))
assert.ok(detail.includes('download=1'))
console.log('PASS: combined filters, list view, 20 simultaneous cached requests, empty results, ticker search, Not Rated, related reports, download links')
