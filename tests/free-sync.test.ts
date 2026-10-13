import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import type { Database, Statement } from "../cloudflare/bindings"
import type { Env } from "../free/server/types"
import type { NotionPage } from "../lib/content-model"
import { runScheduledSync } from "../free/server/sync"
import { ensureSyncRuns } from "../free/jobs/sync-schema"
import worker from "../free/server/worker"

const sources = {
  research:"33333333333343338333333333333333",
  notice:"22222222222242228222222222222222",
  members:"44444444444444448444444444444444",
}
const MINUTE = 60_000
const START = Date.parse("2026-10-14T00:00:00.000Z")
const emptyBatch = () => Response.json({results:[],has_more:false,next_cursor:null})
function setup() {
  const sqlite = new DatabaseSync(":memory:")
  for (const name of ["0002_free_runtime","0003_free_guards","0004_document_versions","0005_webhook_setup","0006_report_cover_cache","0007_sync_runs"]) {
    sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),"utf8"))
  }
  const prepare = (sql:string,values:unknown[]=[]):Statement => ({
    bind:(...args)=>prepare(sql,args),
    async first<T>() { return (sqlite.prepare(sql).get(...values as any[])??null) as T|null },
    async all<T>() { return {results:sqlite.prepare(sql).all(...values as any[]) as T[]} },
    async run() { return sqlite.prepare(sql).run(...values as any[]) },
  })
  const db:Database = {prepare,async batch(statements) {
    sqlite.exec("BEGIN")
    try { const results=[];for(const s of statements) results.push(await s.run());sqlite.exec("COMMIT");return results }
    catch(error) { sqlite.exec("ROLLBACK");throw error }
  }}
  const env:Env = {CMS_DB:db,ASSETS:{fetch},NOTION_TOKEN:"fixture",
    NOTION_REPORTS_DATA_SOURCE_ID:sources.research,NOTION_NOTICES_DATA_SOURCE_ID:sources.notice,
    NOTION_MEMBERS_DATA_SOURCE_ID:sources.members,NOTION_FETCH:async()=>emptyBatch()}
  sqlite.prepare("UPDATE free_sync SET watermark=?,checked_at=?").run(new Date(START-2*MINUTE).toISOString(),START-MINUTE)
  return {sqlite,env}
}
function page():NotionPage {
  const revision = new Date(START).toISOString()
  return {id:"a0000000000000000000000000000001",object:"page",created_time:revision,last_edited_time:revision,
    parent:{type:"data_source_id",data_source_id:sources.research},
    properties:{제목:{type:"title",title:[{plain_text:"동기화 검증"}]},공개:{type:"checkbox",checkbox:true},게시일:{type:"date",date:{start:"2020-01-01"}}}}
}

test("duplicate deliveries query each idle source at most once per two minutes for a full day",async t=>{
  const {sqlite,env}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now)
  env.NOTION_FETCH=async()=>{calls++;return emptyBatch()}
  try {
    for(let minute=0;minute<1440;minute++) {
      now=START+minute*MINUTE+137 // Real cron jitter must not turn two minutes into three.
      for(const kind of ["research","notice","members"] as const) {
        await Promise.all(Array.from({length:3},()=>runScheduledSync(env,kind,now-137)))
      }
      const oldest=Number(sqlite.prepare("SELECT MIN(checked_at) n FROM free_sync").get()!.n)
      assert.ok(now-oldest<300_000,"idle sources must retain the existing five-minute freshness guard")
    }
    assert.equal(calls,2160)
    assert.equal(sqlite.prepare("SELECT count FROM free_budget WHERE key LIKE 'notion-sync-day:%'").get()!.count,2160)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_sync_runs").get()!.n,3)
    now+=3*MINUTE
    assert.equal(await runScheduledSync(env,"research",START),"skipped","an old redelivery stays deduplicated after its lease expires")
    assert.equal(calls,2160)
  } finally {sqlite.close()}
})

test("pagination resumes next minute without falsely refreshing an incomplete scan",async t=>{
  const {sqlite,env}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now)
  env.NOTION_FETCH=async(_input,init)=>{
    const body=JSON.parse(String(init?.body));calls++
    assert.equal(body.page_size,4)
    if(calls===1) return Response.json({results:[page()],has_more:true,next_cursor:"second"})
    assert.equal(body.start_cursor,"second")
    return emptyBatch()
  }
  try {
    assert.equal(await runScheduledSync(env,"research"),"partial")
    assert.equal(sqlite.prepare("SELECT checked_at FROM free_sync WHERE kind='research'").get()!.checked_at,START-MINUTE)
    assert.equal(JSON.parse(String(sqlite.prepare("SELECT body FROM free_documents WHERE name='research'").get()!.body)).items.length,1)
    now+=MINUTE
    assert.equal(await runScheduledSync(env,"research"),"complete")
    const state=sqlite.prepare("SELECT checked_at,cursor,started_at FROM free_sync WHERE kind='research'").get()!
    assert.deepEqual({...state},{checked_at:START,cursor:null,started_at:null})
    assert.equal(calls,2)
  } finally {sqlite.close()}
})

test("continuous catch-up stays below the daily sync cap even with duplicate delivery",async t=>{
  const {sqlite,env}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now)
  env.NOTION_FETCH=async()=>Response.json({results:[],has_more:true,next_cursor:`cursor-${++calls}`})
  try {
    for(let minute=0;minute<1440;minute++) {
      now=START+minute*MINUTE
      for(const kind of ["research","notice","members"] as const) {
        const outcomes=await Promise.all([runScheduledSync(env,kind),runScheduledSync(env,kind)])
        assert.deepEqual(outcomes,["partial","skipped"])
      }
    }
    assert.equal(calls,4320)
    assert.equal(sqlite.prepare("SELECT MIN(checked_at) n FROM free_sync").get()!.n,START-MINUTE,
      "a long partial scan must not bypass the stale-publication guard")
  } finally {sqlite.close()}
})

test("a completed full reconciliation wins over an in-flight incremental checkpoint",async t=>{
  const {sqlite,env}=setup()
  t.mock.method(Date,"now",()=>START)
  env.NOTION_FETCH=async()=>{
    sqlite.prepare("UPDATE free_sync SET watermark=?,checked_at=?,cursor=NULL,started_at=NULL WHERE kind='research'")
      .run(new Date(START).toISOString(),START)
    return Response.json({results:[],has_more:true,next_cursor:"stale-cursor"})
  }
  try {
    assert.equal(await runScheduledSync(env,"research"),"superseded")
    assert.equal(sqlite.prepare("SELECT cursor FROM free_sync WHERE kind='research'").get()!.cursor,null)
  } finally {sqlite.close()}
})

test("an expired lease cannot overwrite its replacement's checkpoint or next run",async t=>{
  const {sqlite,env}=setup();let now=START
  t.mock.method(Date,"now",()=>now)
  let release!:(response:Response)=>void
  let entered!:()=>void
  const requested=new Promise<void>(resolve=>{entered=resolve})
  env.NOTION_FETCH=async()=>{entered();return new Promise<Response>(resolve=>{release=resolve})}
  try {
    const first=runScheduledSync(env,"research")
    await requested
    now+=2*MINUTE
    env.NOTION_FETCH=async()=>emptyBatch()
    assert.equal(await runScheduledSync(env,"research"),"complete")
    const checkpoint=sqlite.prepare("SELECT * FROM free_sync WHERE kind='research'").get()
    const admission=sqlite.prepare("SELECT * FROM free_sync_runs WHERE kind='research'").get()
    release(Response.json({results:[],has_more:true,next_cursor:"expired-cursor"}))
    assert.equal(await first,"superseded")
    assert.deepEqual(sqlite.prepare("SELECT * FROM free_sync WHERE kind='research'").get(),checkpoint)
    assert.deepEqual(sqlite.prepare("SELECT * FROM free_sync_runs WHERE kind='research'").get(),admission)
  } finally {sqlite.close()}
})

test("shared Notion backoff pauses cleanly, preserves stale checks and retries only when due",async t=>{
  const {sqlite,env}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now)
  env.NOTION_FETCH=async()=>{calls++;return emptyBatch()}
  sqlite.prepare("INSERT INTO free_controls VALUES ('notion-backoff',?)").run(START+3*MINUTE)
  try {
    assert.equal(await runScheduledSync(env,"research"),"paused")
    assert.equal(calls,0)
    assert.equal(sqlite.prepare("SELECT checked_at FROM free_sync WHERE kind='research'").get()!.checked_at,START-MINUTE)
    now+=2*MINUTE
    assert.equal(await runScheduledSync(env,"research"),"skipped")
    now+=MINUTE
    assert.equal(await runScheduledSync(env,"research"),"complete")
    assert.equal(calls,1)
  } finally {sqlite.close()}
})

test("a document rebuild failure is repaired when the unchanged batch is retried",async t=>{
  const {sqlite,env}=setup();let now=START,fail=true
  t.mock.method(Date,"now",()=>now)
  env.NOTION_FETCH=async()=>Response.json({results:[page()],has_more:false,next_cursor:null})
  const batch=env.CMS_DB.batch
  env.CMS_DB.batch=async statements=>{
    if(statements.length===2 && fail) {fail=false;throw new Error("Document write failed")}
    return batch(statements)
  }
  try {
    await assert.rejects(runScheduledSync(env,"research"),/Document write failed/)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_content").get()!.n,1)
    assert.equal(sqlite.prepare("SELECT outcome FROM free_sync_runs").get()!.outcome,"error")
    assert.equal(await runScheduledSync(env,"research"),"skipped","immediate retries must not spend quota")
    now+=MINUTE
    assert.equal(await runScheduledSync(env,"research"),"complete")
    assert.equal(JSON.parse(String(sqlite.prepare("SELECT body FROM free_documents WHERE name='research'").get()!.body)).items.length,1)
  } finally {sqlite.close()}
})

test("daily exhaustion waits for the actual UTC reset instead of failing every minute",async t=>{
  const {sqlite,env}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now)
  env.NOTION_FETCH=async()=>{calls++;return emptyBatch()}
  sqlite.prepare("INSERT INTO free_budget VALUES (?,4500,?)").run(`notion-sync-day:${START/86_400_000}`,START+86_400_000)
  try {
    assert.equal(await runScheduledSync(env,"research"),"paused")
    assert.equal(sqlite.prepare("SELECT next_at FROM free_sync_runs").get()!.next_at,START+86_400_000)
    now+=1439*MINUTE
    assert.equal(await runScheduledSync(env,"research"),"skipped")
    assert.equal(calls,0)
    now+=MINUTE
    assert.equal(await runScheduledSync(env,"research"),"complete")
    assert.equal(calls,1)
  } finally {sqlite.close()}
})

test("hourly housekeeping runs once even when the source itself is not due",async t=>{
  const {sqlite,env}=setup();let now=START-MINUTE,calls=0
  t.mock.method(Date,"now",()=>now)
  env.SMP_SYNC_KIND="research"
  env.NOTION_FETCH=async()=>{calls++;return emptyBatch()}
  try {
    await worker.scheduled({scheduledTime:now},env,{waitUntil(){}})
    sqlite.prepare("INSERT INTO free_events VALUES ('expired',?)").run(START-1)
    now=START
    await Promise.all(Array.from({length:3},()=>worker.scheduled({scheduledTime:now},env,{waitUntil(){}})))
    assert.equal(calls,1)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_events").get()!.n,0)
    assert.equal(sqlite.prepare("SELECT until_at FROM free_controls WHERE name='sync-housekeeping'").get()!.until_at,START+60*MINUTE)
  } finally {sqlite.close()}
})

test("the sync migration upgrades existing databases without resetting active leases",async()=>{
  const {sqlite,env}=setup()
  try {
    sqlite.exec("DROP TABLE free_sync_runs")
    await ensureSyncRuns(env.CMS_DB)
    sqlite.prepare("INSERT INTO free_sync_runs VALUES ('research',1,2,'active',3,'running',NULL)").run()
    await ensureSyncRuns(env.CMS_DB)
    assert.equal(sqlite.prepare("SELECT lease_token FROM free_sync_runs").get()!.lease_token,"active")
  } finally {sqlite.close()}
})
