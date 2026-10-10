import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import type { Database,Statement } from "../cloudflare/bindings"
import { spend,notionBudget,publicBudget } from "../free/server/budget"
import { storePage,storePages,rebuildDocuments,removePage } from "../free/server/catalog"
import { reconcileIfDue } from "../free/jobs/reconcile"
import { memberPhoto } from "../free/server/member-photo"
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
    assert.equal(results.filter(r=>r.status==="fulfilled").length,100)
    assert.deepEqual(sqlite.prepare("SELECT count FROM free_budget ORDER BY key").all().map(r=>r.count),[100,100,100,100])
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
test("visitor exhaustion reserves both synchronization and publisher capacity",async()=>{
  const {sqlite,db}=setup()
  try {
    for(let i=0;i<100;i++) await notionBudget(db,100,"visitor")
    await assert.rejects(notionBudget(db,100,"visitor"))
    await notionBudget(db,100,"sync");await notionBudget(db,100,"publisher");await notionBudget(db,100,"webhook")
    sqlite.prepare("UPDATE free_budget SET count=1800 WHERE key='notion-visitor-day:0'").run()
    await assert.rejects(notionBudget(db,60_100,"visitor"))
    await notionBudget(db,60_100,"sync")
    assert.equal(sqlite.prepare("SELECT count FROM free_budget WHERE key='notion-minute:1'").get()!.count,1)
  } finally {sqlite.close()}
})
test("public article admission uses one D1 round trip and rejects unknown or wrong-kind IDs",async()=>{
  const {sqlite,env}=setup();let calls=0
  try {
    await storePage(env,page(),"research")
    const prepare=env.CMS_DB.prepare;env.CMS_DB.prepare=sql=>{calls++;return prepare(sql)}
    const request=new Request(`https://test.invalid/api/detail/research/${id}`)
    assert.equal(await publicBudget(request,env,{id,kind:"research"}),null)
    assert.equal(calls,1)
    assert.equal((await publicBudget(request,env,{id,kind:"notice"}))?.status,404)
    assert.equal((await publicBudget(request,env,{id:"f".repeat(32),kind:"research"}))?.status,404)
    assert.equal(sqlite.prepare("SELECT count FROM free_budget WHERE key LIKE 'public-api-day:%'").get()!.count,3)
  }finally{sqlite.close()}
})
test("withdrawal selects primary keys rather than scanning the whole catalogue",async()=>{
  const {sqlite,env}=setup();const queries:string[]=[]
  const prepare=env.CMS_DB.prepare
  env.CMS_DB.prepare=sql=>{queries.push(sql);return prepare(sql)}
  try {
    const pages=Array.from({length:821},(_,i)=>({...page(),id:i.toString(16).padStart(32,"0")}))
    assert.equal(await storePages(env,pages,"research"),true)
    assert.equal(await storePages(env,pages.slice(0,100),"research"),false)
    const deletion=queries.find(sql=>sql.startsWith("DELETE FROM free_content"))!
    const plan=sqlite.prepare(`EXPLAIN QUERY PLAN ${deletion}`).all("[]","[]").map(row=>row.detail).join(" ")
    assert.match(plan,/SEARCH free_content USING INDEX/)
    assert.doesNotMatch(plan,/SCAN free_content/)
    await storePages(env,[{...pages[300],last_edited_time:"2026-01-02T00:00:00.000Z",properties:page(undefined,false).properties}],"research")
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_content").get()!.n,820)
    await storePages(env,[pages[300]],"research")
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_content").get()!.n,820)
  }finally{sqlite.close()}
})
test("daily reconciliation skips healthy quarter-hour runs and never checkpoints a failed pass",async()=>{
  const {sqlite,env}=setup();let calls=0
  Object.assign(env,{NOTION_WORKLOAD:"publisher",NOTION_NOTICES_DATA_SOURCE_ID:"22222222222242228222222222222222",NOTION_MEMBERS_DATA_SOURCE_ID:"44444444444444448444444444444444",NOTION_FETCH:async()=>{calls++;return Response.json({results:[],has_more:false,next_cursor:null})}})
  try {
    const now=Date.now()
    assert.equal(await reconcileIfDue(env,now),true);assert.equal(calls,3)
    assert.equal(await reconcileIfDue(env,now+60_000),false);assert.equal(calls,3)
    sqlite.prepare("UPDATE free_sync SET checked_at=?").run(now-301_000)
    assert.equal(await reconcileIfDue(env,now),true);assert.equal(calls,6)
    sqlite.prepare("UPDATE free_controls SET until_at=? WHERE name='reconcile-next'").run(now-1)
    env.NOTION_FETCH=async()=>new Response(null,{status:404})
    await assert.rejects(reconcileIfDue(env,now))
    assert.equal(sqlite.prepare("SELECT until_at FROM free_controls WHERE name='reconcile-next'").get()!.until_at,now-1)
  }finally{sqlite.close()}
})
test("future publication wakes reconciliation without an intervening page edit",async()=>{
  const {sqlite,env}=setup()
  try {
    const future=page(),due=Date.now()+3600_000
    future.properties.게시일.date={start:new Date(due).toISOString()}
    await storePage(env,future,"research")
    assert.equal(sqlite.prepare("SELECT until_at FROM free_controls WHERE name=?").get(`publish-at:${id}`)!.until_at,due)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_content").get()!.n,0)
    await storePage(env,page("2025-01-01T00:00:00.000Z"),"research")
    assert.equal(sqlite.prepare("SELECT until_at FROM free_controls WHERE name=?").get(`publish-at:${id}`)!.until_at,due)
    await storePage(env,page("2026-01-02T00:00:00.000Z"),"research")
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_controls WHERE name LIKE 'publish-at:%'").get()!.n,0)
  }finally{sqlite.close()}
})
test("member uploads are prepared once, hidden while pending and served without a live CMS read",async()=>{
  const {sqlite,env}=setup();env.NOTION_MEMBERS_DATA_SOURCE_ID=source
  const member:NotionPage={...page(),properties:{이름:{type:"title",title:[{plain_text:"테스트 회원"}]},기수:{type:"number",number:40},구분:{type:"multi_select",multi_select:[{name:"MEMBERS"}]},공개:{type:"checkbox",checkbox:true},사진:{type:"files",files:[{name:"portrait.jpg",type:"file",file:{url:"https://prod-files-secure.s3.us-west-2.amazonaws.com/test/portrait.jpg"}}]}}}
  try {
    await storePage(env,member,"members");await rebuildDocuments(env,["members"])
    let items=JSON.parse(String(sqlite.prepare("SELECT body FROM free_documents WHERE name='members'").get()!.body)).items
    assert.equal(items[0].image,undefined)
    assert.equal((await memberPhoto(env,id)).status,404)
    const {job}=await (await internal(req("jobs/claim"),env)).json() as any
    assert.equal(job.kind,"members")
    const url=`/report-covers/${id}/${"a".repeat(64)}.webp`
    env.NOTION_FETCH=async()=>Response.json(member)
    assert.equal((await internal(req(`jobs/${id}/complete`,{...job,blocks:[],cover:{url,previewUrl:url,width:640,height:900}}),env)).status,200)
    items=JSON.parse(String(sqlite.prepare("SELECT body FROM free_documents WHERE name='members'").get()!.body)).items
    assert.equal(items[0].image,url)
    env.NOTION_FETCH=async()=>{throw new Error("Must not fetch CMS")}
    sqlite.prepare("UPDATE free_sync SET checked_at=? WHERE kind='members'").run(Date.now())
    assert.equal((await memberPhoto(env,id)).headers.get("Location"),url)
    assert.equal(await storePage(env,member,"members"),false)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_jobs").get()!.n,0)
    member.last_edited_time="2026-01-02T00:00:00.000Z";member.properties.공개.checkbox=false
    await storePage(env,member,"members")
    assert.equal((await memberPhoto(env,id)).status,404)
  }finally{sqlite.close()}
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
