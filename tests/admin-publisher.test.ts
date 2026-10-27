import {test,type TestContext} from "node:test"
import assert from "node:assert/strict"
import {mkdtemp,rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import path from "node:path"
import {publicationFixture} from "./publication-fixture"
import {localDatabase,initPreview} from "../admin-publisher/local-database"
import {publishReports} from "../admin-publisher/runner"
import {LocalPublicationAssets} from "../admin-publisher/assets"
import {previewReader} from "../admin-publisher/preview"
import {validateSnapshot,fingerprint} from "../admin-publisher/source"
import {publicReport} from "../admin-publication/model"
import {sortContent} from "../lib/content-model"
import worker from "../free/server/worker"
import {decodePagePack} from "../lib/pdf-page-pack"

async function fixture(t:TestContext) {
  const f=await publicationFixture(),target=localDatabase(":memory:"),root=await mkdtemp(path.join(tmpdir(),"smp-publish-test-"))
  await initPreview(target.sqlite)
  const assets=new LocalPublicationAssets(root);await assets.init()
  Object.assign(globalThis,{__SMP_FIXTURE__:true})
  const env={CMS_DB:target.db,ASSETS:{fetch:assets.fetch},SMP_READ_ONLY:"1",SMP_FIXTURE:"1",REPORT_PREVIEW:await previewReader(target.db,assets)}
  const get=(url:string,headers?:Record<string,string>)=>worker.fetch(new Request("http://127.0.0.1"+url,{headers}),env,{waitUntil(){}})
  t.after(async()=>{f.sqlite.close();target.sqlite.close();await rm(root,{recursive:true,force:true})})
  return {...f,target,assets,get,run:()=>publishReports(f.source(),target.db,assets,{now:f.now})}
}
test("approval → private Drive export → complete reader → catalog/search/download; edits retain old approval",async t=>{
  const f=await fixture(t);await f.connectDrive()
  const uploaded=await f.upload();let d=uploaded.draft
  assert.equal((await f.source().snapshot()).reports.length,0)
  assert.equal((await f.run()).published,0)
  d=await f.change(d,{type:"approve",reviewed:true})
  assert.equal((await f.source().snapshot()).reports[0].revision,d.revision)
  const result=await f.run();assert.equal(result.published,1);assert.equal(result.prepared,1)
  const id=d.id.replaceAll("-", ""),catalog=await (await f.get("/api/catalog/research")).json() as any
  assert.equal(catalog.items[0].company,"HPSP")
  const detail=await (await f.get(`/api/detail/research/${id}`)).json() as any
  assert.equal(detail.bodyPending,false);assert.equal(detail.item.cover.reader.pageCount,3)
  const {pack,packSource}=detail.item.cover.reader
  const packed=await f.get(`/api/content/research/${id}/pdf?prepared=${packSource}&pages=${pack.key}`)
  assert.equal(packed.status,200);assert.equal(decodePagePack(new Uint8Array(await packed.arrayBuffer()),3).length,3)
  const download=await f.get(`/api/content/research/${id}/pdf?index=0&download=1`)
  assert.match(download.headers.get("content-disposition")!,/^attachment/)
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()),uploaded.pdf)
  const range=await f.get(`/api/content/research/${id}/pdf?index=0`,{range:"bytes=0-4"})
  assert.equal(range.status,206);assert.equal(await range.text(),"%PDF-")
  assert.equal((await f.get(`/api/content/research/${id}/pdf?prepared=${"0".repeat(64)}`)).status,404)
  assert.equal((await f.get(`/_reader-pdfs/${id}/${pack.key}.pack`)).status,404)
  assert.match(JSON.stringify(await (await f.get("/api/search")).json()),/403870/)
  assert.doesNotMatch(JSON.stringify(detail),/generated_file|refresh_token|test-access|evidence/)
  assert.ok([...f.google.files.values()].every(file=>file.permissions.every(p=>p.type==="user")))
  d=await f.change(d,{type:"edit",fields:{...d.fields,title:"승인 전 비공개 수정"}})
  assert.equal((await f.run()).unchanged,true)
  assert.doesNotMatch(await (await f.get("/api/catalog/research")).text(),/승인 전/)
  d=await f.change(d,{type:"approve",reviewed:true})
  const reused=await f.run();assert.equal(reused.reused,1);assert.equal(reused.prepared,0)
  assert.match(await (await f.get("/api/catalog/research")).text(),/승인 전 비공개 수정/)
  const requests=f.google.calls.length;assert.equal((await f.run()).unchanged,true);assert.equal(f.google.calls.length,requests)
  d=await f.change(d,{type:"trash",trashed:true});assert.equal((await f.run()).withdrawn,1)
  assert.equal((await f.get(`/api/detail/research/${id}`)).status,404)
  assert.equal((await f.get(`/api/content/research/${id}/pdf?download=1`)).status,404)
  d=await f.change(d,{type:"trash",trashed:false});assert.equal((await f.source().snapshot()).reports.length,0)
})
test("failed preparation, stale approvals, bounded retries and daily budget preserve the published edition",async t=>{
  const f=await fixture(t),upload=await f.upload()
  let d=await f.change(upload.draft,{type:"approve",reviewed:true})
  await f.run()
  const before=f.target.sqlite.prepare("SELECT approved FROM preview_reports").get()!.approved
  const second=await f.upload(1)
  let other=await f.change(second.draft,{type:"approve",reviewed:true})
  let calls=0
  const fail=async()=>{calls++;throw Error("converter failed")}
  const run=()=>publishReports(f.source(),f.target.db,f.assets,{now:f.now,prepare:fail})
  assert.equal((await run()).failed,1);assert.equal((await run()).deferred,1)
  for(let i=0;i<3;i++){f.tick(16*60000);await run()}
  assert.equal(calls,3);assert.equal(f.target.sqlite.prepare("SELECT approved FROM preview_reports").get()!.approved,before)
  await f.login()
  // A new approval can retry, but changing source state during work is rejected.
  other=await f.change(other,{type:"approve",reviewed:true})
  const source=f.source(),snapshot=source.snapshot.bind(source);let reads=0
  source.snapshot=async()=>{if(++reads===2)d=await f.change(d,{type:"trash",trashed:true});return snapshot()}
  await assert.rejects(publishReports(source,f.target.db,f.assets,{now:f.now,prepare:fail}),/changed during preparation/)
  assert.equal(f.target.sqlite.prepare("SELECT approved FROM preview_reports").get()!.approved,before)
  f.target.sqlite.prepare("INSERT OR REPLACE INTO preview_controls(key,value) VALUES(?,10)").run(`day:${Math.floor(f.now()/86400000)}`)
  other=await f.change(other,{type:"approve",reviewed:true})
  assert.ok((await run()).deferred>0)
})
test("complete snapshots, export authorization and explicit preview target are mandatory",async t=>{
  const f=await fixture(t),origin=f.env.ORIGIN
  assert.equal((await f.request(origin+"/api/publisher/reports")).status,401)
  const key=f.env.REPORT_EXPORT_KEY;delete f.env.REPORT_EXPORT_KEY
  assert.equal((await f.request(origin+"/api/publisher/reports",{headers:{Authorization:`Bearer ${key}`}})).status,404)
  f.env.REPORT_EXPORT_KEY=key
  for(const bad of [{},{version:1,complete:false,reports:[],fingerprint:fingerprint([])},{version:1,complete:true,reports:[],fingerprint:"bad"}])assert.throws(()=>validateSnapshot(bad as any))
  const reader=await previewReader(f.target.db,f.assets)
  assert.equal(await reader.published('a'.repeat(32)),undefined,'unowned content must retain the Notion path')
  f.target.sqlite.prepare("DELETE FROM preview_config").run()
  await assert.rejects(f.run(),/outside the isolated/)
})
test("ordering uses approved fields and preserves semester order without PDF conversion",async t=>{
  const f=await fixture(t),a=await f.upload(),b=await f.upload(1)
  await f.change(a.draft,{type:"approve",reviewed:true});await f.change(b.draft,{type:"approve",reviewed:true})
  const snapshot=await f.source().snapshot()
  assert.equal((await f.run()).prepared,2)
  const requests=f.google.calls.length
  const order=await (await f.call("/api/reports/order")).json()
  await f.call("/api/reports/order","PUT",{revision:order.revision,ids:[a.draft.id,b.draft.id]})
  const changed=await f.source().snapshot()
  assert.deepEqual(changed.reports.map(r=>r.id),[a.draft.id,b.draft.id].map(id=>id.replaceAll("-", "")))
  assert.deepEqual(sortContent(changed.reports.map((r,i)=>publicReport(r,i+1))).map(r=>r.company),["HPSP","인바디"])
  const published=await f.run()
  assert.equal(published.prepared,0);assert.equal(f.google.calls.length,requests)
  const catalog=await (await f.get('/api/catalog/research')).json() as any
  assert.deepEqual(catalog.items.map((r:any)=>r.company),['HPSP','인바디'])
  for(const fields of [{...changed.reports[0].fields,title:true},{...changed.reports[0].fields,notRated:'yes'},{...changed.reports[0].fields,token:'private'}]) {
    const reports=[{...changed.reports[0],fields}]
    assert.throws(()=>validateSnapshot({version:1,complete:true,reports,fingerprint:fingerprint(reports)} as any))
  }
  const original=snapshot.reports[0]
  f.target.sqlite.prepare('DELETE FROM preview_reports WHERE id=?').run(original.id)
  await assert.rejects(f.run(),/Notion content cannot be replaced/)
})
test("PDF replacement keeps the approved original until successful new approval; damaged source fails closed",async t=>{
  const f=await fixture(t);await f.connectDrive()
  const first=await f.upload(),approved=await f.change(first.draft,{type:"approve",reviewed:true})
  await f.run()
  const replacement=await f.upload(1,approved)
  assert.equal(replacement.draft.id,approved.id)
  const source=f.source(),stillOld=(await source.snapshot()).reports[0]
  assert.equal(stillOld.identity,approved.hash)
  assert.deepEqual(await source.pdf(stillOld),first.pdf)
  assert.equal((await f.run()).unchanged,true)
  const latest=await f.change(replacement.draft,{type:"approve",reviewed:true})
  assert.equal((await f.run()).prepared,1)
  const id=latest.id.replaceAll("-", "")
  assert.deepEqual(new Uint8Array(await (await f.get(`/api/content/research/${id}/pdf?download=1`)).arrayBuffer()),replacement.pdf)
  const active=f.sqlite.prepare("SELECT f.file_id FROM report_files f JOIN report_file_bindings b ON b.asset_id=f.id WHERE b.report_id=?").get(latest.id) as {file_id:string}
  f.google.files.get(active.file_id)!.data[20]^=1
  await assert.rejects(f.source().pdf((await f.source().snapshot()).reports[0]))
  f.sqlite.prepare("UPDATE report_files SET state='pending-delete' WHERE file_id=?").run(active.file_id)
  await assert.rejects(f.run(),/source unavailable/)
  assert.equal(f.target.sqlite.prepare("SELECT count(*) AS n FROM preview_reports").get()!.n,1)
})
test("concurrent runner lease, future publication dates, and full rollback on commit failure",async t=>{
  const f=await fixture(t),first=await f.upload()
  let d=await f.change(first.draft,{type:"edit",fields:{...first.draft.fields,date:"2099-01-01"}})
  d=await f.change(d,{type:"approve",reviewed:true})
  assert.equal((await f.source().snapshot()).reports.length,0)
  d=await f.change(d,{type:"edit",fields:{...d.fields,date:"2026-10-20"}})
  d=await f.change(d,{type:"approve",reviewed:true})
  f.target.sqlite.prepare("INSERT INTO preview_controls(key,value,token) VALUES('lease',?,'another')").run(f.now()+60000)
  assert.equal((await f.run()).busy,true)
  f.target.sqlite.prepare("DELETE FROM preview_controls WHERE key='lease'").run()
  f.target.sqlite.exec("CREATE TRIGGER test_commit_failure BEFORE INSERT ON free_documents BEGIN SELECT RAISE(ABORT,'simulated commit failure'); END")
  await assert.rejects(f.run(),/simulated commit failure/)
  assert.equal(f.target.sqlite.prepare("SELECT count(*) AS n FROM free_content").get()!.n,0)
  assert.equal(f.target.sqlite.prepare("SELECT count(*) AS n FROM preview_reports").get()!.n,0)
})
