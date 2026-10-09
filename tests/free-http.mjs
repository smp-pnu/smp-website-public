import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const remote=process.argv.includes('--remote')
const base=remote?'https://smp-fixture-preview.smp-website.workers.dev':'http://127.0.0.1:3005'
const run=Date.now().toString(36),id='a0000000000000000000000000000001'
const paths={shell:'/research',catalog:'/api/catalog/research',search:'/api/search',detail:`/api/detail/research/${id}`,pdf:`/api/content/research/${id}/pdf?source=external`}
const measurements=[]
async function get(kind,phase='single',range=false){
  const url=new URL(paths[kind],base);url.searchParams.set('trial',run);url.searchParams.set('phase',phase)
  const start=performance.now(),res=await fetch(url,{signal:AbortSignal.timeout(30_000),headers:range?{Range:'bytes=0-99'}:{}}),body=await res.arrayBuffer()
  measurements.push({kind,phase,status:res.status,ms:Math.round(performance.now()-start),bytes:body.byteLength})
  assert.equal(res.status,range?206:200)
  assert.match(res.headers.get('x-robots-tag'),/noindex/)
  if(kind==='shell'){assert.match(new TextDecoder().decode(body),/id="root"/);assert.match(res.headers.get('content-security-policy'),/script-src 'self' 'wasm-unsafe-eval'/)}
  else {assert.match(res.headers.get('cache-control'),/no-store/);assert.equal(res.headers.get('x-content-type-options'),'nosniff')}
  if(kind==='catalog'){const value=JSON.parse(new TextDecoder().decode(body));assert.equal(value.items.length,600);assert.ok(value.items[0].cover.url);return value}
  if(kind==='detail')assert.ok(JSON.parse(new TextDecoder().decode(body)).blocks.length)
  if(kind==='pdf'){assert.equal(new TextDecoder().decode(body.slice(0,5)),'%PDF-');if(range)assert.equal(body.byteLength,100)}
}
assert.equal((await(await fetch(`${base}/api/health`)).json()).mode,'fixture')
const catalog=await get('catalog')
await get('shell');await get('search');await get('detail');await get('pdf','range',true)
const cover=await fetch(new URL(catalog.items[0].cover.url,base));assert.equal(cover.status,200);assert.match(cover.headers.get('content-type'),/image\/webp/);await cover.body.cancel()
for(const path of ['/api/internal/status','/api/detail/research/ffffffffffffffffffffffffffffffff']) assert.equal((await fetch(base+path)).status,404)
assert.equal((await fetch(base+'/api/catalog/research',{method:'POST'})).status,405)
assert.equal((await fetch(base+'/api/catalog/research',{headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'cors'}})).status,403)
for(let i=0;i<5;i++)await get('catalog','serial')
const results=await Promise.allSettled(Array.from({length:100},(_,i)=>get(i<50?'catalog':i<80?'detail':'pdf','burst')))
const failures=results.filter(r=>r.status==='rejected').map(r=>String(r.reason))
const summary=['catalog','detail','pdf'].map(kind=>{const values=measurements.filter(r=>r.kind===kind&&r.phase==='burst').map(r=>r.ms).sort((a,b)=>a-b);return {kind,count:values.length,p50ms:values[Math.ceil(values.length*.5)-1],p95ms:values[Math.ceil(values.length*.95)-1]}})
await mkdir('test-results',{recursive:true})
await writeFile(`test-results/free-${remote?'remote':'local'}.json`,JSON.stringify({run,date:new Date().toISOString(),summary,failures,measurements},null,2))
console.log(JSON.stringify({run,summary,failures},null,2));assert.equal(failures.length,0)
