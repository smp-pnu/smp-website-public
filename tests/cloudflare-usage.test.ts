import {test} from "node:test"
import assert from "node:assert/strict"
import {DatabaseSync} from "node:sqlite"
import {readFileSync} from "node:fs"
import type {Database,Statement} from "../cloudflare/bindings"
import {collectCloudUsage,parseWorkers,parseRows,parseStorage} from "../free/jobs/cloudflare-metrics"
import {CLOUD_USAGE_SCHEMA,readCloudUsage} from "../cms/cloudflare-usage"
import {CLOUD_INTERVAL,cloudDay,cloudPartStale} from "../admin-lab/cloudflare-model"
const graph=(value:unknown)=>({data:{viewer:{accounts:[value]}},errors:null})
const workers=graph({workers:[{dimensions:{scriptName:'admin'},sum:{requests:101,errors:1},quantiles:{cpuTimeP50:1500,cpuTimeP99:12000}},{dimensions:{scriptName:'site'},sum:{requests:900,errors:0},quantiles:{cpuTimeP50:1000,cpuTimeP99:8000}}],status:[{dimensions:{status:'success'},sum:{requests:1000}},{dimensions:{status:'exceededResources'},sum:{requests:1}}]})
const rows=graph({d1:[{sum:{rowsRead:3456,rowsWritten:42}}]})
const storage={success:true,result:[{name:'admin',file_size:1024},{name:'cms',file_size:4096}],result_info:{total_count:2}}
function fixture() {
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cms/schema.sql','utf8'))
  const prepare=(query:string,values:unknown[]=[]):Statement=>({bind:(...v)=>prepare(query,v),async first<T>(){return (sql.prepare(query).get(...values as never[])??null) as T|null},async all<T>(){return {results:sql.prepare(query).all(...values as never[]) as T[]}},async run(){return sql.prepare(query).run(...values as never[])}})
  const db:Database={prepare,async batch(v){return Promise.all(v.map(s=>s.run()))}}
  return {sql,db}
}
test('Cloudflare metrics convert microseconds and keep per-Worker CPU percentiles instead of adding them',()=>{
  const result=parseWorkers(workers,0,10)
  assert.equal(result.requests,1001);assert.equal(result.errors,1);assert.equal(result.resourceErrors,1)
  assert.equal(result.scripts[0].p50Ms,1.5);assert.equal(result.scripts[0].p99Ms,12)
  assert.deepEqual(parseRows(rows,0,10),{start:0,end:10,read:3456,written:42})
  assert.deepEqual(parseStorage(storage),{bytes:5120,databases:[{name:'cms',bytes:4096},{name:'admin',bytes:1024}]})
})
test('Cloudflare missing, failed and truncated responses are never treated as zero usage',()=>{
  for(const body of [{errors:[{message:'denied'}]},graph({workers:null,status:[]}),graph({workers:Array(100).fill({}),status:[]}),graph({workers:[{dimensions:{scriptName:'x'},sum:{requests:null}}],status:[]})])assert.throws(()=>parseWorkers(body,0,1))
  assert.throws(()=>parseRows(graph({d1:[{sum:{rowsRead:1}}]}),0,1))
  assert.throws(()=>parseStorage({...storage,result_info:{total_count:3}}))
  assert.throws(()=>parseStorage({...storage,result:[{name:'admin',file_size:-1}]}))
  assert.equal(parseWorkers(graph({workers:[],status:[]}),0,1).requests,0)
  assert.equal(parseRows(graph({d1:[]}),0,1).read,0)
})
test('usage period resets at UTC midnight (09:00 KST) and yesterday snapshots are marked old',()=>{
  const now=Date.parse('2026-10-28T00:01:00Z')
  assert.equal(cloudDay(now),Date.parse('2026-10-28T00:00:00Z'))
  assert.equal(cloudPartStale({value:{},checkedAt:now-120000,error:false},now),true)
  assert.equal(cloudPartStale({value:{},checkedAt:now,error:false},now),false)
  assert.equal(cloudPartStale({value:{},checkedAt:now,error:false},now+46*60000),true)
})
test('collector coalesces callers, throttles for 15 minutes, and never stores API credentials',async()=>{
  const {sql,db}=fixture(),config={account:'a'.repeat(32),token:'DO_NOT_EXPOSE'},now=Date.parse('2026-10-28T03:00:00Z');let calls=0
  const fake:typeof fetch=async(url,init)=>{
    calls++;assert.equal(init?.redirect,'error');assert.match(String((init?.headers as Record<string,string>).Authorization),/DO_NOT_EXPOSE/)
    if(String(url).endsWith('graphql')){const request=JSON.parse(String(init?.body));assert.equal(request.variables.start,'2026-10-28T00:00:00.000Z');return Response.json(request.query.includes('workersInvocations')?workers:rows)}
    return Response.json(storage)
  }
  try {
    await Promise.all([collectCloudUsage(db,config,now,fake),collectCloudUsage(db,config,now,fake)])
    assert.equal(calls,3)
    assert.deepEqual(await collectCloudUsage(db,config,now+60000,fake),{skipped:true,failed:0})
    assert.equal((await readCloudUsage(db)).workers.value?.requests,1001)
    assert.equal(sql.prepare('SELECT count(*) n FROM cms_cloud_usage').get()?.n,1)
    assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM cms_cloud_usage').all()).includes('DO_NOT_EXPOSE'))
  }finally{sql.close()}
})
test('partial failure preserves successful previous data and timestamp; failure backs off too',async()=>{
  const {sql,db}=fixture(),config={account:'a'.repeat(32),token:'token'},now=Date.parse('2026-10-28T03:00:00Z')
  const fake:typeof fetch=async(url,init)=>Response.json(String(url).includes('/d1/database?')?storage:String(init?.body).includes('workersInvocations')?workers:rows)
  try {
    await collectCloudUsage(db,config,now,fake)
    const fails:typeof fetch=async(url)=>{if(String(url).includes('graphql'))return Response.json({errors:[{message:'SECRET_REMOTE_ERROR'}]});return Response.json({...storage,result:storage.result.map(r=>({...r,file_size:r.file_size+1}))})}
    const result=await collectCloudUsage(db,config,now+CLOUD_INTERVAL,fails),snapshot=await readCloudUsage(db)
    assert.equal(result.failed,2);assert.equal(snapshot.workers.error,true);assert.equal(snapshot.workers.checkedAt,now);assert.equal(snapshot.workers.value?.requests,1001)
    assert.equal(snapshot.storage.error,false);assert.equal(snapshot.storage.checkedAt,now+CLOUD_INTERVAL);assert.equal(snapshot.storage.value?.bytes,5122)
    assert.ok(!JSON.stringify(snapshot).includes('SECRET_REMOTE_ERROR'))
    assert.equal((await collectCloudUsage(db,config,now+CLOUD_INTERVAL+1,fails)).skipped,true)
  }finally{sql.close()}
})
test('first failed collection reports unavailable, not 0; snapshot table stays bounded',async()=>{
  const {sql,db}=fixture()
  try {
    assert.equal((await readCloudUsage(db)).workers.value,null)
    sql.exec(CLOUD_USAGE_SCHEMA)
    const result=await collectCloudUsage(db,{account:'a'.repeat(32),token:'token'},10,async()=>new Response('',{status:403}))
    assert.equal(result.failed,3);assert.equal((await readCloudUsage(db)).workers.value,null)
    assert.throws(()=>sql.exec('INSERT INTO cms_cloud_usage(id) VALUES(2)'))
    assert.throws(()=>sql.prepare('UPDATE cms_cloud_usage SET payload=? WHERE id=1').run(JSON.stringify('x'.repeat(131072))))
  }finally{sql.close()}
})
