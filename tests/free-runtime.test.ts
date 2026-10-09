import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import type { Database,Statement } from "../cloudflare/bindings"
import { spend,notionBudget } from "../free/server/budget"
import { storePage,rebuildDocuments,removePage } from "../free/server/catalog"
import { internal } from "../free/server/jobs"
import { notion } from "../free/server/notion"
import type { Env } from "../free/server/types"
import type { NotionPage } from "../lib/content-model"
const source="33333333333343338333333333333333",id="a0000000000000000000000000000001"
function setup() {
  const sqlite=new DatabaseSync(":memory:")
  for(const name of ["0002_free_runtime","0003_free_guards","0004_document_versions"]) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),"utf8"))
  const prepare=(sql:string,values:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...values as any[])??null) as T|null},async all<T>(){return {results:sqlite.prepare(sql).all(...values as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...values as any[])}})
  const db:Database={prepare,async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results}catch(e){sqlite.exec("ROLLBACK");throw e}}}
  const env:Env={CMS_DB:db,ASSETS:{fetch},NOTION_TOKEN:"test-token",NOTION_REPORTS_DATA_SOURCE_ID:source}
  return {sqlite,db,env}
}
function page(revision="2026-01-01T00:00:00.000Z",visible=true):NotionPage {
  return {id,object:"page",created_time:revision,last_edited_time:revision,parent:{type:"data_source_id",data_source_id:source},properties:{제목:{type:"title",title:[{plain_text:"검증 리포트"}]},공개:{type:"checkbox",checkbox:visible},게시일:{type:"date",date:{start:"2020-01-01"}}}}
}
const req=(suffix:string,input?:unknown)=>new Request(`https://test.invalid/api/internal/${suffix}`,{method:"POST",...(input?{body:JSON.stringify(input)}:{})})
test("global budget permits exactly the limit under concurrent use and rolls over",async()=>{
  const {sqlite,db}=setup()
  try {
    const results=await Promise.allSettled(Array.from({length:100},()=>spend(db,"test-concurrent",10,1000,1,100)))
    assert.equal(results.filter(r=>r.status==="fulfilled").length,10)
    assert.equal(sqlite.prepare("SELECT count FROM free_budget").get()!.count,10)
    await spend(db,"test-concurrent",10,1000,1,1001)
    await assert.rejects(spend(db,"invalid-batch",10,1000,11,1001))
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_budget WHERE key LIKE 'invalid-batch%'").get()!.n,0)
  } finally {sqlite.close()}
})
test("CMS budget reserves both windows atomically and honors shared backoff",async()=>{
  const {sqlite,db}=setup()
  try {
    const results=await Promise.allSettled(Array.from({length:150},()=>notionBudget(db,100)))
    assert.equal(results.filter(r=>r.status==="fulfilled").length,120)
    assert.deepEqual(sqlite.prepare("SELECT count FROM free_budget ORDER BY key").all().map(r=>r.count),[120,120])
    sqlite.prepare("UPDATE free_budget SET count=8000 WHERE key='notion-day:0'").run()
    await assert.rejects(notionBudget(db,60_100))
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM free_budget WHERE key='notion-minute:1'").get()!.n,0)
    sqlite.prepare("UPDATE free_budget SET count=120").run()
    sqlite.prepare("INSERT INTO free_controls VALUES ('notion-backoff',120000)").run()
    await assert.rejects(notionBudget(db,60_100))
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM free_budget WHERE key='notion-minute:1'").get()!.n,0)
    await notionBudget(db,120_100)
  }finally{sqlite.close()}
})
test("out-of-order events cannot resurrect unpublished/deleted pages; completed work is not enqueued again",async()=>{
  const {sqlite,env}=setup()
  try {
    await storePage(env,page(),"research")
    sqlite.prepare("UPDATE free_content SET blocks='[]',body_revision=revision").run();sqlite.prepare("DELETE FROM free_jobs").run()
    const before=Number(sqlite.prepare("SELECT total_changes() n").get()!.n)
    await storePage(env,page(),"research")
    assert.equal(Number(sqlite.prepare("SELECT total_changes() n").get()!.n),before,"unchanged reconciliation must not consume row-write quota")
    await storePage(env,page("2026-01-02T00:00:00.000Z",false),"research")
    await storePage(env,page(),"research")
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_content").get()!.n,0)
    await storePage(env,page("2026-01-03T00:00:00.000Z"),"research")
    await rebuildDocuments(env)
    assert.equal(JSON.parse(String(sqlite.prepare("SELECT body FROM free_documents WHERE name='research'").get()!.body)).items.length,1)
    await removePage(env,id,"2026-01-04T00:00:00.000Z")
    await storePage(env,page("2026-01-03T00:00:00.000Z"),"research")
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_content").get()!.n,0)
  } finally {sqlite.close()}
})
test("empty queue does not spend preparation quota; leases and five-attempt cap prevent repeated jobs",async()=>{
  const {sqlite,env}=setup()
  try {
    await internal(req("jobs/claim"),env)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_budget").get()!.n,0)
    await storePage(env,page(),"research")
    const {job}=await (await internal(req("jobs/claim"),env)).json() as any
    assert.ok(job.token)
    assert.deepEqual(await (await internal(req("jobs/claim"),env)).json(),{job:null})
    assert.equal((await internal(req(`jobs/${id}/fail`,{token:"wrong",revision:job.revision}),env)).status,409)
    await internal(req(`jobs/${id}/fail`,{token:job.token,revision:job.revision,retryAfterMs:1}),env)
    const failed=sqlite.prepare("SELECT attempts,next_at,lease_until FROM free_jobs").get()!
    assert.equal(failed.attempts,1);assert.equal(failed.lease_until,0);assert.ok(Number(failed.next_at)>Date.now()+890_000)
    sqlite.prepare("UPDATE free_jobs SET attempts=5,next_at=0").run()
    assert.deepEqual(await (await internal(req("jobs/claim"),env)).json(),{job:null})
  } finally {sqlite.close()}
})
test("publication is rechecked before completing a prepared body",async()=>{
  const {sqlite,env}=setup()
  try {
    await storePage(env,page(),"research")
    const {job}=await (await internal(req("jobs/claim"),env)).json() as any
    env.NOTION_FETCH=async()=>Response.json(page("2026-01-01T00:00:00.000Z",false))
    assert.equal((await internal(req(`jobs/${id}/complete`,{...job,blocks:[]}),env)).status,409)
    assert.equal(sqlite.prepare("SELECT blocks FROM free_content").get()!.blocks,null)
  } finally {sqlite.close()}
})
test("Workers-compatible CMS transport refuses redirects without forwarding its token",async()=>{
  const {sqlite,env}=setup();let calls=0
  try {
    env.NOTION_FETCH=async(input,init)=>{
      calls++
      assert.equal(String(input),"https://api.notion.com/v1/pages/test")
      assert.equal(init?.redirect,"manual")
      return new Response(null,{status:302,headers:{Location:"https://untrusted.invalid/"}})
    }
    await assert.rejects(notion(env,"pages/test"),/CMS unavailable \(302\)/)
    assert.equal(calls,1)
  } finally {sqlite.close()}
})
test("Notion throttling does not retry before the shared Retry-After expires",async()=>{
  const {sqlite,env}=setup();let calls=0
  try {
    env.NOTION_FETCH=async()=>{calls++;return new Response("",{status:429,headers:{"Retry-After":"120"}})}
    await assert.rejects(notion(env,"pages/test"))
    await assert.rejects(notion(env,"pages/test"))
    assert.equal(calls,1)
    assert.ok(Number(sqlite.prepare("SELECT until_at FROM free_controls WHERE name='notion-backoff'").get()!.until_at)>Date.now()+119_000)
  } finally {sqlite.close()}
})
