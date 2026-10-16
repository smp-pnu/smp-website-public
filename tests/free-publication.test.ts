import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import type {Database,Statement} from '../cloudflare/bindings'
import type {Env} from '../free/server/types'
import {storePage,rebuildDocuments} from '../free/server/catalog'
import worker from '../free/server/worker'
import {toContentItem,type NotionPage} from '../lib/content-model'
import {sourceKey} from '../lib/cover-metadata'

test('cached catalog is rejected after withdrawal or stale publication verification',async()=>{
  const originalFetch=global.fetch
  Object.assign(globalThis,{__SMP_FIXTURE__:false})
  const cache=new Map<string,Response>(),pending:Promise<unknown>[]=[]
  Object.assign(globalThis,{caches:{default:{async match(key:Request){return cache.get(key.url)?.clone()},async put(key:Request,value:Response){cache.set(key.url,value.clone())}}}})
  const sqlite=new DatabaseSync(':memory:')
  for(const name of ['0002_free_runtime','0003_free_guards','0004_document_versions','0006_report_cover_cache','0008_publication_checks','0009_job_failures'])sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),'utf8'))
  const prepare=(sql:string,params:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...params as any[])??null) as T|null},async all<T>(){return{results:sqlite.prepare(sql).all(...params as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...params as any[])}})
  const db:Database={prepare,batch:async statements=>Promise.all(statements.map(s=>s.run()))}
  const source='33333333333343338333333333333333'
  const env:Env={CMS_DB:db,ASSETS:{fetch},NOTION_TOKEN:'fixture',NOTION_REPORTS_DATA_SOURCE_ID:source}
  const page:NotionPage={id:'a0000000000000000000000000000001',object:'page',created_time:'2020-01-01T00:00:00Z',last_edited_time:'2020-01-01T00:00:00Z',parent:{type:'data_source_id',data_source_id:source},properties:{제목:{type:'title',title:[{plain_text:'공개였다가 비공개'}]},공개:{type:'checkbox',checkbox:true},게시일:{type:'date',date:{start:'2020-01-01'}}}}
  const request=()=>worker.fetch(new Request('https://fixture.invalid/api/catalog/research'),env,{waitUntil:p=>pending.push(p)})
  try{
    await storePage(env,page,'research');await rebuildDocuments(env)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now())
    let response=await request();assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/)
    assert.equal((await response.json() as any).items.length,1);await Promise.all(pending);assert.equal(cache.size,1)
    page.properties['외부 링크']={type:'url',url:'https://drive.google.com/file/d/fixture-published-report/view'}
    env.NOTION_FETCH=async()=>Response.json(page)
    const pdfBytes=new TextEncoder().encode('%PDF-1.7\nfixture')
    global.fetch=async()=>new Response(pdfBytes,{headers:{'content-length':String(pdfBytes.length)}})
    const pdfRequest=()=>worker.fetch(new Request(`https://fixture.invalid/api/content/research/${page.id}/pdf?source=external`),env,{waitUntil:p=>pending.push(p)})
    const pdf=await pdfRequest();assert.equal(pdf.status,200);await pdf.arrayBuffer();await Promise.all(pending)
    const warm=await pdfRequest();assert.match(warm.headers.get('server-timing')!,/HIT/);await warm.arrayBuffer()
    const pdfKey=[...cache.keys()].find(key=>key.includes('/api/cache/pdf/'))!
    assert.ok(pdfKey)
    assert.equal((await worker.fetch(new Request(pdfKey),env,{waitUntil(){}})).status,404,'internal cache URL cannot bypass publication checks')
    const asset=`/_reader-pdfs/${page.id}/${'a'.repeat(64)}.pdf`
    const prepared={sourceKey:sourceKey(toContentItem(page,'research')!),pdfHash:'b'.repeat(64),reader:{version:1,pageCount:1,pages:[{page:1,url:`/report-covers/${page.id}/${'c'.repeat(64)}.webp`,width:2048,height:2899}],pdf:{url:asset,bytes:pdfBytes.length,sourceBytes:pdfBytes.length,sourceModified:'Tue, 06 Oct 2026 04:50:46 GMT',checkedAt:Date.now()}}}
    sqlite.prepare('UPDATE free_content SET cover=?,body_revision=? WHERE id=?').run(JSON.stringify(prepared),page.last_edited_time??'',page.id)
    env.ASSETS.fetch=async()=>new Response(pdfBytes,{headers:{'content-type':'application/pdf','content-length':String(pdfBytes.length)}})
    const accelerated=await pdfRequest();assert.match(accelerated.headers.get('server-timing')!,/PREPARED/);await accelerated.arrayBuffer()
    prepared.reader.pdf=Object.assign(prepared.reader.pdf,{chunkSize:1024*1024})
    sqlite.prepare('UPDATE free_content SET cover=? WHERE id=?').run(JSON.stringify(prepared),page.id)
    const chunked=await pdfRequest();assert.match(chunked.headers.get('server-timing')!,/CHUNKED/);await chunked.arrayBuffer()
    for(const raw of [asset,asset.replace('.pdf','.0000.bin'),asset.replace('/_','/%5f'),asset.replace('/_reader-pdfs/','/_reader-pdfs%2F')])assert.equal((await worker.fetch(new Request('https://fixture.invalid'+raw),env,{waitUntil(){}})).status,404,'raw prepared asset cannot bypass publication checks')
    page.properties.공개.checkbox=false;page.last_edited_time='2020-01-02T00:00:00Z'
    await storePage(env,page,'research');await rebuildDocuments(env)
    assert.equal((await pdfRequest()).status,404,'a warm PDF cache must not survive withdrawal')
    response=await request();assert.equal((await response.json() as any).items.length,0)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now()-180_000)
    assert.equal((await request()).status,200)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now()-301_000)
    assert.equal((await request()).status,503)
    assert.equal((await worker.fetch(new Request('https://fixture.invalid/api/internal/status'),env,{waitUntil(){}})).status,404)
  }finally{global.fetch=originalFetch;await Promise.all(pending);sqlite.close();delete (globalThis as any).caches}
})
