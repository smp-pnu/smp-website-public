import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import type {Statement} from '../cloudflare/bindings'
import type {Env} from '../free/server/types'
import worker from '../free/server/worker'

test('signed deletion catches reports trashed between polls without relaying unpublishing or foreign pages',async t=>{
  Object.assign(globalThis,{__SMP_FIXTURE__:false})
  const sqlite=new DatabaseSync(':memory:')
  for(const name of ['0002_free_runtime','0003_free_guards','0004_document_versions','0006_report_cover_cache'])sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),'utf8'))
  const prepare=(sql:string,params:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...params as any[])??null) as T|null},async all<T>(){return{results:sqlite.prepare(sql).all(...params as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...params as any[])}})
  const source='33333333333343338333333333333333',id='a0000000000000000000000000000001'
  const token='test-webhook-verification-token',relayed:unknown[]=[]
  let page:any={id,object:'page',created_time:'2020-01-01T00:00:00Z',last_edited_time:'2026-01-01T00:00:00Z',in_trash:true,parent:{type:'data_source_id',data_source_id:source},properties:{}}
  const env:Env={CMS_DB:{prepare,batch:async stmts=>Promise.all(stmts.map(s=>s.run()))},ASSETS:{fetch},NOTION_TOKEN:'test-notion-token',NOTION_REPORTS_DATA_SOURCE_ID:source,NOTION_NOTICES_DATA_SOURCE_ID:'22222222222242228222222222222222',NOTION_MEMBERS_DATA_SOURCE_ID:'44444444444444448444444444444444',NOTION_WEBHOOK_VERIFICATION_TOKEN:token,DRIVE_CLEANUP_WEB_APP_URL:'https://script.google.com/macros/s/test-fixture/exec',NOTION_FETCH:async()=>page?Response.json(page):new Response(null,{status:404})}
  t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
    assert.equal(input,env.DRIVE_CLEANUP_WEB_APP_URL)
    const message=JSON.parse(String(init?.body)),payload=JSON.parse(message.payload)
    assert.equal(message.signature,createHmac('sha256',env.NOTION_TOKEN!).update(`smp-drive-cleanup-v1\n${message.payload}`).digest('hex'))
    relayed.push(payload);return Response.json({ok:true})
  })
  const send=(type:string,signed=true,eventId?:string)=>{
    const body=JSON.stringify({type,entity:{type:'page',id},...(eventId?{id:eventId}:{})})
    return worker.fetch(new Request('https://fixture.invalid/api/notion/webhook',{method:'POST',body,headers:signed?{'x-notion-signature':`sha256=${createHmac('sha256',token).update(body).digest('hex')}`}:{}}),env,{waitUntil(){}})
  }
  try{
    assert.equal((await send('page.deleted',false)).status,401);assert.equal(relayed.length,0)
    assert.equal((await send('page.deleted')).status,200);assert.equal(relayed.length,1)
    assert.equal((relayed[0] as any).pageId,id)
    assert.equal((await send('page.deleted',true,'same-event')).status,200);assert.equal(relayed.length,2)
    assert.equal((await send('page.deleted',true,'same-event')).status,200);assert.equal(relayed.length,2)
    relayed.pop()
    page={...page,in_trash:false,properties:{공개:{type:'checkbox',checkbox:false}}}
    assert.equal((await send('page.properties_updated')).status,200);assert.equal(relayed.length,1)
    assert.equal((await send('page.deleted')).status,200);assert.equal(relayed.length,1)
    page={...page,in_trash:true,parent:{type:'data_source_id',data_source_id:'ffffffffffffffffffffffffffffffff'}}
    assert.equal((await send('page.deleted')).status,200);assert.equal(relayed.length,1)
    page=null
    assert.equal((await send('page.deleted')).status,200);assert.equal(relayed.length,1)
  }finally{sqlite.close()}
})
