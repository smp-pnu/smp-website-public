import {test} from "node:test"
import assert from "node:assert/strict"
import {DatabaseSync} from "node:sqlite"
import {readFileSync} from "node:fs"
import type {Database,Statement} from "../cloudflare/bindings"
import type {Env} from "../free/server/types"
import type {NotionPage} from "../lib/content-model"
import {storePage,removePage} from "../free/server/catalog"
import {visitorPublication,PUBLICATION_CHECK_TTL} from "../free/server/publication"
import {published} from "../free/server/notion"
import {ensurePublicationChecks} from "../free/jobs/publication-schema"
const source="33333333333343338333333333333333",id="a0000000000000000000000000000001"
function setup() {
  const sqlite=new DatabaseSync(":memory:")
  for(const name of ["0002_free_runtime","0003_free_guards","0004_document_versions","0006_report_cover_cache","0008_publication_checks"]) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),"utf8"))
  const prepare=(sql:string,values:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...values as any[])??null) as T|null},async all<T>(){return {results:sqlite.prepare(sql).all(...values as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...values as any[])}})
  const db:Database={prepare,async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results}catch(e){sqlite.exec("ROLLBACK");throw e}}}
  const env:Env={CMS_DB:db,ASSETS:{fetch},NOTION_TOKEN:"test-token",NOTION_REPORTS_DATA_SOURCE_ID:source}
  return {sqlite,db,env}
}
function page(revision="2026-01-01T00:00:00.000Z",visible=true):NotionPage {
  return {id,object:"page",created_time:revision,last_edited_time:revision,parent:{type:"data_source_id",data_source_id:source},properties:{제목:{type:"title",title:[{plain_text:"검증 리포트"}]},공개:{type:"checkbox",checkbox:visible},게시일:{type:"date",date:{start:"2020-01-01"}}}}
}

test("detail and PDF readers share a bounded cross-instance publication check",async t=>{
 const {sqlite,env,db}=setup();let now=Date.now(),calls=0;t.mock.method(Date,"now",()=>now)
 env.NOTION_FETCH=async()=>{calls++;return Response.json(page())}
 try {
  await storePage(env,page(),"research")
  const values=await Promise.all(Array.from({length:100},()=>visitorPublication(env,"research",id)))
  assert.equal(calls,1);assert.ok(values.every(Boolean))
  const second={...env,CMS_DB:{prepare:db.prepare,batch:db.batch}}
  for(let range=0;range<50;range++) assert.ok(await visitorPublication(second,"research",id))
  assert.equal(calls,1)
  now+=PUBLICATION_CHECK_TTL
  assert.ok(await visitorPublication(second,"research",id));assert.equal(calls,2)
  await published(env,"research",id);assert.equal(calls,3,"publisher verification must remain fresh")
 }finally{sqlite.close()}
})
test("processed unpublish, delete, edits and source changes invalidate a warm check",async()=>{
 const {sqlite,env}=setup();let current=page(),calls=0
 env.NOTION_FETCH=async()=>{calls++;return Response.json(current)}
 try {
  await storePage(env,current,"research");await visitorPublication(env,"research",id)
  current=page("2026-01-02T00:00:00.000Z",false);await storePage(env,current,"research")
  assert.equal(await visitorPublication(env,"research",id),null);assert.equal(calls,2)
  current=page("2026-01-03T00:00:00.000Z");await storePage(env,current,"research");await visitorPublication(env,"research",id)
  current=page("2026-01-04T00:00:00.000Z");current.properties.제목.title=[{plain_text:"Updated"}];await storePage(env,current,"research")
  assert.equal((await visitorPublication(env,"research",id))?.title,"Updated")
  await removePage(env,id);current={...current,in_trash:true}
  assert.equal(await visitorPublication(env,"research",id),null)
  assert.equal(await visitorPublication({...env,NOTION_REPORTS_DATA_SOURCE_ID:"44444444444444448444444444444444"},"research",id),null)
 }finally{sqlite.close()}
})
test("a missed webhook cannot extend cached access past 60 seconds, even on outage",async t=>{
 const {sqlite,env}=setup();let now=Date.now(),current=page();t.mock.method(Date,"now",()=>now)
 env.NOTION_FETCH=async()=>Response.json(current)
 try {
  await storePage(env,current,"research");await visitorPublication(env,"research",id)
  current={...current,in_trash:true};now+=PUBLICATION_CHECK_TTL-1
  assert.ok(await visitorPublication(env,"research",id))
  now++;env.NOTION_FETCH=async()=>{throw new Error("offline")}
  await assert.rejects(visitorPublication(env,"research",id),/offline/)
  env.NOTION_FETCH=async()=>Response.json(current)
  assert.equal(await visitorPublication(env,"research",id),null)
 }finally{sqlite.close()}
})
test("an in-flight old response cannot warm the cache after a newer withdrawal",async()=>{
 const {sqlite,env}=setup()
 try {
  await storePage(env,page(),"research")
  env.NOTION_FETCH=async()=>{await storePage(env,page("2026-01-02T00:00:00.000Z",false),"research");return Response.json(page())}
  await visitorPublication(env,"research",id)
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_publication_checks").get()!.n,0)
 }finally{sqlite.close()}
})
test("publication cache migration is idempotent",async()=>{
 const {sqlite,db}=setup()
 try {sqlite.exec("DROP TABLE free_publication_checks");await ensurePublicationChecks(db);await ensurePublicationChecks(db);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_publication_checks").get()!.n,0)}finally{sqlite.close()}
})
