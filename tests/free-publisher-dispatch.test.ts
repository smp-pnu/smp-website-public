import {test} from "node:test"
import assert from "node:assert/strict"
import {DatabaseSync} from "node:sqlite"
import {readFileSync} from "node:fs"
import type {Statement} from "../cloudflare/bindings"
import type {Env} from "../free/server/types"
import {requestPublisher} from "../free/server/publisher"

const START=Date.parse("2026-10-15T00:00:00.000Z")
function setup() {
  const sqlite=new DatabaseSync(":memory:")
  for(const name of ["0002_free_runtime","0003_free_guards"])sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),"utf8"))
  const prepare=(sql:string,values:unknown[]=[]):Statement=>({
    bind:(...args)=>prepare(sql,args),
    async first<T>(){return (sqlite.prepare(sql).get(...values as any[])??null) as T|null},
    async all<T>(){return {results:sqlite.prepare(sql).all(...values as any[]) as T[]}},
    async run(){return sqlite.prepare(sql).run(...values as any[])},
  })
  const env:Env={CMS_DB:{prepare,batch:async statements=>Promise.all(statements.map(s=>s.run()))},ASSETS:{fetch},
    GITHUB_PUBLISH_TOKEN:"test-only-token",PUBLISH_FETCH:async()=>new Response(null,{status:204})}
  const queue=()=>sqlite.prepare("INSERT INTO free_jobs(id,revision,next_at) VALUES ('queued','revision',0)").run()
  return {sqlite,env,queue}
}

test("no credential, read-only mode and empty queues never trigger GitHub or consume quota",async()=>{
  const {sqlite,env,queue}=setup();let calls=0
  env.PUBLISH_FETCH=async()=>{calls++;throw new Error("must not fetch")}
  try {
    assert.equal(await requestPublisher(env),"idle")
    queue();env.SMP_READ_ONLY="1"
    assert.equal(await requestPublisher(env),"disabled")
    env.SMP_READ_ONLY="0";delete env.GITHUB_PUBLISH_TOKEN
    assert.equal(await requestPublisher(env),"disabled")
    assert.equal(calls,0)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_budget").get()!.n,0)
  } finally {sqlite.close()}
})

test("concurrent hints request only the fixed main workflow once per cooldown",async t=>{
  const {sqlite,env,queue}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now);queue()
  env.PUBLISH_FETCH=async(input,init)=>{
    calls++
    assert.equal(String(input),"https://api.github.com/repos/smp-pnu/smp-website-public/actions/workflows/free-publish.yml/dispatches")
    assert.equal(init?.redirect,"manual")
    assert.equal(new Headers(init?.headers).get("X-GitHub-Api-Version"),"2026-03-10")
    assert.deepEqual(JSON.parse(String(init?.body)),{ref:"main"})
    return Response.json({workflow_run_id:123})
  }
  try {
    const results=await Promise.all(Array.from({length:50},()=>requestPublisher(env)))
    assert.equal(results.filter(x=>x==="requested").length,1)
    now+=14*60_000;assert.equal(await requestPublisher(env),"idle")
    now+=60_000;assert.equal(await requestPublisher(env),"requested")
    assert.equal(calls,2)
  } finally {sqlite.close()}
})

test("active publishing, leased jobs and terminal failures do not start extra workflows",async t=>{
  const {sqlite,env,queue}=setup()
  t.mock.method(Date,"now",()=>START);queue()
  try {
    sqlite.prepare("INSERT INTO free_controls VALUES ('publisher',?)").run(START+60_000)
    assert.equal(await requestPublisher(env),"idle")
    sqlite.exec("DELETE FROM free_controls; UPDATE free_jobs SET lease_until=9999999999999")
    assert.equal(await requestPublisher(env),"idle")
    sqlite.exec("UPDATE free_jobs SET lease_until=0,attempts=5")
    assert.equal(await requestPublisher(env),"idle")
  } finally {sqlite.close()}
})

test("future publication wakes the workflow only after its due date",async t=>{
  const {sqlite,env}=setup();let now=START
  t.mock.method(Date,"now",()=>now)
  sqlite.prepare("INSERT INTO free_controls VALUES ('publish-at:page',?)").run(START+60_000)
  try {
    assert.equal(await requestPublisher(env),"idle")
    now+=60_000
    assert.equal(await requestPublisher(env),"requested")
  } finally {sqlite.close()}
})

test("failed dispatches retain jobs, reject redirects and wait before retrying",async t=>{
  const {sqlite,env,queue}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now);t.mock.method(console,"warn",()=>{});queue()
  env.PUBLISH_FETCH=async()=>{calls++;return new Response(null,{status:302,headers:{Location:"https://untrusted.invalid"}})}
  try {
    assert.equal(await requestPublisher(env),"deferred")
    assert.equal(await requestPublisher(env),"idle")
    assert.equal(calls,1)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_jobs").get()!.n,1)
    now+=15*60_000
    env.PUBLISH_FETCH=async()=>{throw new Error("network unavailable")}
    assert.equal(await requestPublisher(env),"deferred")
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_jobs").get()!.n,1)
  } finally {sqlite.close()}
})

test("automatic publication requests stop at twelve per UTC day and resume after reset",async t=>{
  const {sqlite,env,queue}=setup();let now=START,calls=0
  t.mock.method(Date,"now",()=>now);queue()
  env.PUBLISH_FETCH=async()=>{calls++;return new Response(null,{status:204})}
  try {
    for(let i=0;i<12;i++){assert.equal(await requestPublisher(env),"requested");now+=15*60_000}
    assert.equal(await requestPublisher(env),"paused")
    assert.equal(calls,12)
    now=START+86_400_000
    assert.equal(await requestPublisher(env),"requested")
    assert.equal(calls,13)
  } finally {sqlite.close()}
})

test("GitHub's longer retry-after is honored without discarding pending jobs",async t=>{
  const {sqlite,env,queue}=setup();let now=START+2*86_400_000,calls=0
  t.mock.method(Date,"now",()=>now);t.mock.method(console,"warn",()=>{});queue()
  env.PUBLISH_FETCH=async()=>{calls++;return new Response(null,{status:429,headers:{"Retry-After":"3600"}})}
  try {
    assert.equal(await requestPublisher(env),"deferred")
    now+=15*60_000
    assert.equal(await requestPublisher(env),"idle")
    assert.equal(calls,1)
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM free_jobs").get()!.n,1)
  } finally {sqlite.close()}
})


test("admin recruitment changes dispatch without PDF jobs; terminal CMS failures remain idle",async t=>{
 const {sqlite,env}=setup();t.mock.method(Date,"now",()=>START+3*86400000);env.CMS_ADMIN_MODE=true
 sqlite.exec(readFileSync(new URL('../cms/schema.sql',import.meta.url),'utf8'))
 sqlite.exec("CREATE TABLE free_admin_config(name TEXT PRIMARY KEY,value TEXT NOT NULL)")
 try {
  assert.equal(await requestPublisher(env),'idle')
  sqlite.exec("INSERT INTO cms_jobs(id,revision,payload,next_at,attempts) VALUES('failed',1,'{}',0,3)")
  assert.equal(await requestPublisher(env),'idle')
  sqlite.exec("INSERT INTO free_admin_config VALUES('recruitment_validated','new')")
  assert.equal(await requestPublisher(env),'requested')
  sqlite.exec("DELETE FROM free_controls; INSERT INTO free_admin_config VALUES('recruitment_deployed','new')")
  assert.equal(await requestPublisher(env),'idle')
 }finally{sqlite.close()}
})
