import {test} from "node:test"
import assert from "node:assert/strict"
import {DatabaseSync} from "node:sqlite"
import {readFileSync} from "node:fs"
import type {Database,Statement} from "../cloudflare/bindings"
import type {Env} from "../free/server/types"
import type {NotionPage} from "../lib/content-model"
import {storePage} from "../free/server/catalog"
import {internal} from "../free/server/jobs"
import {safeJobError,jobErrorCode} from "../free/server/job-errors"
import {Busy} from "../free/server/types"
import {ensureJobFailures} from "../free/jobs/job-schema"
import {maintenanceInput,managePublication,publicationStatus} from "../free/jobs/maintenance"
const source="33333333333343338333333333333333",id="a0000000000000000000000000000001"
function setup() {
  const sqlite=new DatabaseSync(":memory:")
  for(const name of ["0002_free_runtime","0003_free_guards","0004_document_versions","0006_report_cover_cache","0008_publication_checks","0009_job_failures","0007_sync_runs"]) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),"utf8"))
  const prepare=(sql:string,values:unknown[]=[]):Statement=>({bind:(...args)=>prepare(sql,args),async first<T>(){return(sqlite.prepare(sql).get(...values as any[])??null) as T|null},async all<T>(){return {results:sqlite.prepare(sql).all(...values as any[]) as T[]}},async run(){return sqlite.prepare(sql).run(...values as any[])}})
  const db:Database={prepare,async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results}catch(e){sqlite.exec("ROLLBACK");throw e}}}
  const env:Env={CMS_DB:db,ASSETS:{fetch},NOTION_TOKEN:"test-token",NOTION_REPORTS_DATA_SOURCE_ID:source}
  return {sqlite,db,env}
}
function page(revision="2026-01-01T00:00:00.000Z",visible=true):NotionPage {
  return {id,object:"page",created_time:revision,last_edited_time:revision,parent:{type:"data_source_id",data_source_id:source},properties:{제목:{type:"title",title:[{plain_text:"검증 리포트"}]},공개:{type:"checkbox",checkbox:visible},게시일:{type:"date",date:{start:"2020-01-01"}}}}
}

test("maintenance validates fixed operations and exact page IDs",()=>{
 assert.deepEqual(maintenanceInput("status"),{operation:"status",id:null})
 assert.deepEqual(maintenanceInput("refresh-report",id),{operation:"refresh-report",id})
 for(const value of ["", "https://notion.so/"+id, "a".repeat(100), "';DELETE"]) assert.throws(()=>maintenanceInput("refresh-report",value))
 assert.throws(()=>maintenanceInput("shell",id));assert.throws(()=>maintenanceInput("status",id))
})
test("refresh and retry target one published unlocked item and leave source content intact",async()=>{
 const {sqlite,db,env}=setup();const now=Date.now()
 try {
  await storePage(env,page(),"research");sqlite.exec("DELETE FROM free_jobs")
  const original=sqlite.prepare("SELECT item FROM free_content WHERE id=?").get(id)!.item
  assert.equal(await managePublication(db,"refresh-report",id,now),true)
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_jobs").get()!.n,1)
  await assert.rejects(managePublication(db,"retry-failed",id,now),/No stopped/)
  sqlite.prepare("UPDATE free_jobs SET attempts=5,last_error='asset_preparation',failed_at=?").run(now)
  await managePublication(db,"retry-failed",id,now+1)
  assert.equal(sqlite.prepare("SELECT attempts FROM free_jobs").get()!.attempts,0)
  assert.equal(sqlite.prepare("SELECT item FROM free_content WHERE id=?").get(id)!.item,original)
  sqlite.prepare("UPDATE free_jobs SET lease_until=?").run(now+60_000)
  await assert.rejects(managePublication(db,"refresh-report",id,now),/unlocked/)
  sqlite.prepare("INSERT INTO free_controls(name,until_at) VALUES('publisher',?)").run(now+60_000)
  await assert.rejects(managePublication(db,"refresh-report",id,now),/Publisher is active/)
 }finally{sqlite.close()}
})
test("unpublished and non-report pages cannot be manually refreshed",async()=>{
 const {sqlite,db,env}=setup()
 try {
  await assert.rejects(managePublication(db,"refresh-report",id),/No published/)
  await storePage(env,page(),"research");sqlite.prepare("UPDATE free_content SET kind='notice'").run()
  await assert.rejects(managePublication(db,"refresh-report",id),/No published/)
 }finally{sqlite.close()}
})
test("job failures persist a safe code and status excludes credentials, titles and URLs",async()=>{
 const {sqlite,db,env}=setup()
 try {
  await storePage(env,page(),"research")
  const claim=await internal(new Request("https://test.invalid/api/internal/jobs/claim",{method:"POST"}),env)
  const {job}=await claim.json() as any
  const fail=await internal(new Request(`https://test.invalid/api/internal/jobs/${id}/fail`,{method:"POST",body:JSON.stringify({token:job.token,revision:job.revision,errorCode:"secret=https://private.invalid/?token=hidden"})}),env)
  assert.equal(fail.status,200)
  assert.equal(sqlite.prepare("SELECT last_error FROM free_jobs").get()!.last_error,"publication_failed")
  assert.ok(sqlite.prepare("SELECT failed_at FROM free_jobs").get()!.failed_at)
  const summary=JSON.stringify(await publicationStatus(db))
  assert.match(summary,/publication_failed/);assert.doesNotMatch(summary,/private.invalid|test-token|검증 리포트|lease_token|hidden/)
  assert.equal(jobErrorCode(new Busy(60)),"upstream_busy")
  assert.equal(safeJobError("unexpected"),"publication_failed")
 }finally{sqlite.close()}
})
test("failure schema repairs a partially migrated database without duplicate columns",async()=>{
 const {sqlite,db}=setup()
 try {
  sqlite.exec("ALTER TABLE free_jobs DROP COLUMN failed_at")
  await ensureJobFailures(db);await ensureJobFailures(db)
  assert.equal(sqlite.prepare("PRAGMA table_info(free_jobs)").all().filter(row=>row.name==="failed_at").length,1)
 }finally{sqlite.close()}
})
