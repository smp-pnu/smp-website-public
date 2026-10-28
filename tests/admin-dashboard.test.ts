import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import type { Database, Statement } from "../cloudflare/bindings"
import { dashboardData } from "../admin-cloud/dashboard"
import { dashboardSnapshot } from "../admin-cloud/dashboard-cache"
import { parseDriveQuota } from "../admin-cloud/drive/connection"
import { capacityLabel } from "../admin-lab/dashboard-model"

function fixture() {
  const sql = new DatabaseSync(":memory:")
  for(const file of ['admin-cloud/schema.sql','cms/schema.sql','cms/budget.sql']) sql.exec(readFileSync(file,'utf8'))
  const prepare = (query:string,values:unknown[]=[]):Statement => ({
    bind:(...v)=>prepare(query,v),
    async first<T>() {return (sql.prepare(query).get(...values as never[])??null) as T|null},
    async all<T>() {return {results:sql.prepare(query).all(...values as never[]) as T[]}},
    async run() {return sql.prepare(query).run(...values as never[])},
  })
  const db:Database={prepare,async batch(v){return Promise.all(v.map(s=>s.run()))}}
  return {sql,db}
}
test('dashboard distinguishes published revisions, private drafts and trash without exposing payloads',async()=>{
  const {sql,db}=fixture(), now=Date.parse('2026-10-28T13:00:00Z'), day=Math.floor(now/86400000)
  try {
    const entry=sql.prepare("INSERT INTO cms_entries(id,kind,draft,revision,approved,approved_revision,updated_at,trashed_at) VALUES(?,?,?,2,?,?,?,?)")
    for(const [id,kind,published,trash] of [['a','research',1,null],['b','research',null,null],['c','research',1,'2026-10-27'],['d','members',2,null]] as const)
      entry.run(id,kind,JSON.stringify({item:{title:'DO_NOT_EXPOSE_PRIVATE_BODY'}}),published?'{}':null,published,'2026-10-28',trash)
    sql.prepare("INSERT INTO cms_jobs(id,revision,payload,next_at,error) VALUES('a',2,'DO_NOT_EXPOSE_JOB_TOKEN',0,'DO_NOT_EXPOSE_REMOTE_ERROR')").run()
    sql.prepare("INSERT INTO usage(key,hits,expires) VALUES(?,3,?)").run(`drive-new:${day}`,now+86400000)
    sql.prepare("INSERT INTO usage(key,hits,expires) VALUES(?,8,?)").run(`metadata-day:${day-1}`,now)
    const data=await dashboardData(db,db,now)
    assert.deepEqual({...data.content[0]},{kind:'research',total:3,published:1,drafts:1,changed:1,trash:1})
    assert.deepEqual(data.content[1],{kind:'notice',total:0,published:0,drafts:0,changed:0,trash:0})
    assert.equal(data.jobs.pending,1);assert.equal(data.jobs.failed,1)
    assert.equal(data.daily.uploads,3);assert.equal(data.daily.ai,0)
    assert.equal(data.daily.resetsAt,Date.parse('2026-10-29T00:00:00Z'))
    assert.ok(data.storage.metadataBytes>0)
    assert.ok(!JSON.stringify(data).includes('DO_NOT_EXPOSE'))
  } finally {sql.close()}
})
test('dashboard original inventory counts each file once and distinguishes Drive PDFs from DB budget',async()=>{
  const {sql,db}=fixture()
  try {
    for(const [id,provider,bytes,state] of [['drive','drive',4000,'ready'],['old','drive',6000,'pending-delete'],['local','d1',2000,'ready'],['gone','drive',8000,'deleted']] as const)
      sql.prepare("INSERT INTO report_files(id,provider,identity,pdf_bytes,cover_bytes,created,state) VALUES(?,?,?,?,100,1,?)").run(id,provider,id,bytes,state)
    for(const id of ['one','two']) {
      sql.prepare("INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data) VALUES(?,?,'ready','admin',4000,100,?)").run(id,id,JSON.stringify({filename:'Example.pdf',secret:'DO_NOT_EXPOSE'}))
      sql.prepare("INSERT INTO report_storage(object_id,provider) VALUES(?,'drive')").run(id)
      sql.prepare("INSERT INTO report_file_bindings(report_id,asset_id) VALUES(?,'drive')").run(id)
    }
    const data=await dashboardData(db,db)
    assert.equal(data.originals.count,3);assert.equal(data.originals.driveBytes,10000)
    assert.equal(data.originals.databaseBytes,2000);assert.equal(data.originals.retainedBytes,8000)
    assert.equal(data.storage.adminBytes,2400) // two covers + old cover + local PDF/cover
    assert.equal(data.files.length,3);assert.equal(data.files[0].bytes,6000)
    assert.equal(data.files.find(f=>f.name==='Example.pdf')?.retained,0)
    assert.ok(!JSON.stringify(data).includes('DO_NOT_EXPOSE'))
  } finally {sql.close()}
})
test('dashboard cache coalesces concurrent misses and backs off without replacing successful data on failure',async()=>{
  const {sql,db}=fixture();let calls=0,release!:()=>void
  const loading=new Promise<void>(resolve=>{release=resolve})
  const load=async()=>{calls++;await loading;return {usage:123}}
  try {
    const a=dashboardSnapshot(db,'drive',600000,load,1000)
    const b=dashboardSnapshot(db,'drive',600000,load,1000)
    release();await Promise.all([a,b]);assert.equal(calls,1)
    const first=await dashboardSnapshot(db,'drive',600000,load,2000)
    assert.deepEqual(first.value,{usage:123});assert.equal(first.checkedAt,1000);assert.equal(first.stale,false)
    const fail=async()=>{calls++;throw Error('DO_NOT_EXPOSE_TOKEN')}
    const stale=await dashboardSnapshot(db,'drive',600000,fail,601000)
    assert.deepEqual(stale.value,{usage:123});assert.equal(stale.stale,true);assert.equal(stale.checkedAt,1000)
    await dashboardSnapshot(db,'drive',600000,fail,602000);assert.equal(calls,2)
    assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM dashboard_snapshots').all()).includes('DO_NOT_EXPOSE'))
    const absent=await dashboardSnapshot(db,'overview',60000,fail,1000)
    assert.equal(absent.value,null);assert.equal(absent.checkedAt,null);assert.equal(absent.stale,true)
  } finally {sql.close()}
})
test('Google quota omits unknown components and never mistakes missing values for free capacity',()=>{
  assert.deepEqual(parseDriveQuota({limit:'100',usage:'60',usageInDrive:'40',usageInDriveTrash:'10'}),{limit:100,usage:60,remaining:40,drive:40,trash:10,other:20})
  assert.deepEqual(parseDriveQuota({usage:'60'}),{limit:null,usage:60,remaining:null,drive:null,trash:null,other:null})
  assert.equal(parseDriveQuota({limit:'100',usage:'110'}).remaining,0)
  assert.equal(parseDriveQuota({limit:'100',usage:'60',usageInDrive:'70'}).drive,null)
  assert.equal(parseDriveQuota({limit:'100',usage:'60',usageInDrive:'40',usageInDriveTrash:'50'}).trash,null)
  for(const v of [undefined,{}, {usage:''},{usage:'-1'},{usage:'9007199254740992'},{usage:'0',limit:'0'}]) assert.throws(()=>parseDriveQuota(v))
  assert.equal(capacityLabel(0),'0 B');assert.equal(capacityLabel(15*1024**3),'15 GB')
})
