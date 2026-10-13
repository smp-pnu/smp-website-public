import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import type { Database, Statement } from '../cloudflare/bindings'
import type { ContentItem } from '../lib/content-model'
import type { Env } from '../free/server/types'
import { rebuildDocuments, removePage } from '../free/server/catalog'
import { rssXml, sitemapIndexXml } from '../free/seo/feeds'
import worker from '../free/server/worker'

const base:ContentItem={id:'a0000000000000000000000000000001',kind:'notice',title:'행사 안내',summary:'모임 안내',date:'2020-01-01',editedAt:'2020-01-02T00:00:00Z',category:'행사',author:'SMP',pinned:false,attachments:[],externalUrl:null}
const paragraph=(text:string)=>[{id:'p',type:'paragraph',paragraph:{rich_text:[{plain_text:text}]}}]
function fixture() {
  Object.assign(globalThis,{__SMP_FIXTURE__:false})
  const sqlite=new DatabaseSync(':memory:')
  for(const name of ['0002_free_runtime','0003_free_guards','0004_document_versions','0006_report_cover_cache','0008_publication_checks','0009_job_failures']) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),'utf8'))
  const prepare=(sql:string,params:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...params as any[])??null) as T|null},async all<T>(){return{results:sqlite.prepare(sql).all(...params as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...params as any[])}})
  const db:Database={prepare,batch:async statements=>Promise.all(statements.map(s=>s.run()))}
  const env:Env={CMS_DB:db,ASSETS:{fetch:async()=>new Response(sitemapIndexXml())},NOTION_FETCH:async()=>{throw new Error('Discovery must not call Notion')}}
  const insert=(item:ContentItem,body=paragraph('본문 전체'),revision=item.editedAt!)=>sqlite.prepare('INSERT INTO free_content(id,kind,revision,item,search_entry,blocks,body_revision) VALUES(?,?,?,?,?,?,?)').run(item.id,item.kind,item.editedAt!,JSON.stringify(item),'{}',JSON.stringify(body),revision)
  const request=(path:string,method='GET')=>worker.fetch(new Request(`https://pnusmp.com${path}`,{method}),env,{waitUntil(){}})
  sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now())
  return {sqlite,env,insert,request}
}

test('RSS escapes CMS markup and XML controls, keeps full body, and preserves absolute image links',()=>{
  const xml=rssXml([{item:{...base,title:'A & <B>\u0001',summary:'요약 '.repeat(300)},blocks:[...paragraph('본문 '.repeat(400)),{id:'i',type:'image',image:{external:{url:'https://pnusmp.com/report-covers/test.webp'},caption:[{plain_text:'사진'}]}}]}])
  assert.match(xml,/<title>A &amp; &lt;B&gt;<\/title>/)
  assert.doesNotMatch(xml,/\u0001|<img|<p>/)
  assert.match(xml,/https:\/\/pnusmp.com\/report-covers\/test.webp/)
  assert.match(xml,new RegExp('본문 '.repeat(400)))
  assert.match(xml,/<pubDate>Wed, 01 Jan 2020 00:00:00 GMT<\/pubDate>/)
  assert.match(xml,/<guid isPermaLink="true">https:\/\/pnusmp.com\/notice\//)
})

test('feeds exclude unprepared bodies, old revisions, members and withdrawn content; stale sync fails closed',async()=>{
  const {sqlite,env,insert,request}=fixture()
  try {
    insert(base)
    insert({...base,id:'a0000000000000000000000000000002',title:'수정 중'},paragraph('과거 본문'),'old-revision')
    insert({...base,id:'a0000000000000000000000000000003',title:'명단'})
    sqlite.prepare("UPDATE free_content SET kind='members' WHERE id LIKE '%3'").run()
    let response=await request('/feed.xml')
    assert.equal(response.status,200);assert.match(response.headers.get('content-type')!,/rss\+xml/)
    assert.match(response.headers.get('cache-control')!,/no-store/)
    let xml=await response.text()
    assert.match(xml,/행사 안내/);assert.match(xml,/본문 전체/);assert.doesNotMatch(xml,/수정 중|과거 본문|명단/)
    await removePage(env,base.id)
    xml=await(await request('/feed.xml')).text();assert.doesNotMatch(xml,/행사 안내|본문 전체/)
    sqlite.prepare("UPDATE free_sync SET checked_at=? WHERE kind='notice'").run(Date.now()-301_000)
    response=await request('/feed.xml');assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60')
    assert.equal((await request('/feed.xml','POST')).status,405)
    assert.equal(await(await request('/feed.xml','HEAD')).text(),'')
  } finally {sqlite.close()}
})

test('feed work is bounded by total UTF-8 source bytes and ten entries without truncating a body',async()=>{
  const {sqlite,insert,request}=fixture()
  try {
    for(let i=1;i<=12;i++) insert({...base,id:`a${i.toString(16).padStart(31,'0')}`,date:`2020-01-${String(i).padStart(2,'0')}`,title:`글 ${i}`})
    let xml=await(await request('/feed.xml')).text()
    assert.equal((xml.match(/<item>/g)??[]).length,10)
    assert.ok(xml.indexOf('글 12')<xml.indexOf('글 11'));assert.doesNotMatch(xml,/<title>글 [12]<\/title>/)
    sqlite.prepare('UPDATE free_content SET blocks=?').run(JSON.stringify(paragraph('가'.repeat(25000))))
    xml=await(await request('/feed.xml')).text()
    assert.equal((xml.match(/<item>/g)??[]).length,2)
    assert.equal((xml.match(/가/g)??[]).length,50000)
    sqlite.prepare('UPDATE free_content SET blocks=?').run(JSON.stringify(paragraph('가'.repeat(34000))))
    assert.equal((await(await request('/feed.xml')).text()).includes('<item>'),false)
  } finally {sqlite.close()}
})

test('static sitemap index survives a database outage; article maps retain dates and isolate source failures',async()=>{
  const {sqlite,env,insert,request}=fixture()
  try {
    insert({...base,kind:'research'})
    await rebuildDocuments(env)
    sqlite.prepare("UPDATE free_sync SET checked_at=0 WHERE kind='notice'").run()
    const response=await request('/sitemap-research.xml'),xml=await response.text()
    assert.equal(response.status,200)
    assert.match(xml,/<lastmod>2020-01-02T00:00:00Z<\/lastmod>/)
    assert.doesNotMatch(xml,/\/about|\/notice\//)
    assert.equal((await request('/sitemap-notice.xml')).status,503)
    env.CMS_DB={prepare(){throw new Error('Database unavailable')},batch:async()=>{throw new Error('Database unavailable')}}
    const root=await request('/sitemap.xml')
    assert.equal(root.status,200)
    const index=await root.text();assert.equal((index.match(/<sitemap>/g)??[]).length,3)
  } finally {sqlite.close()}
})
