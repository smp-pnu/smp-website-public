import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import type {Database,Statement} from '../cloudflare/bindings'
import type {Env} from '../free/server/types'
import {storePage,rebuildDocuments} from '../free/server/catalog'
import worker from '../free/server/worker'
import type {NotionPage} from '../lib/content-model'

test('cached catalog is rejected after withdrawal or stale publication verification',async()=>{
  Object.assign(globalThis,{__SMP_FIXTURE__:false})
  const cache=new Map<string,Response>(),pending:Promise<unknown>[]=[]
  Object.assign(globalThis,{caches:{default:{async match(key:Request){return cache.get(key.url)?.clone()},async put(key:Request,value:Response){cache.set(key.url,value.clone())}}}})
  const sqlite=new DatabaseSync(':memory:')
  for(const name of ['0002_free_runtime','0003_free_guards','0004_document_versions','0006_report_cover_cache'])sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),'utf8'))
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
    page.properties.공개.checkbox=false;page.last_edited_time='2020-01-02T00:00:00Z'
    await storePage(env,page,'research');await rebuildDocuments(env)
    response=await request();assert.equal((await response.json() as any).items.length,0)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now()-180_000)
    assert.equal((await request()).status,200)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now()-301_000)
    assert.equal((await request()).status,503)
    assert.equal((await worker.fetch(new Request('https://fixture.invalid/api/internal/status'),env,{waitUntil(){}})).status,404)
  }finally{await Promise.all(pending);sqlite.close();delete (globalThis as any).caches}
})
