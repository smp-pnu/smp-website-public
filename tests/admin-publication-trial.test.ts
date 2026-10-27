import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {publicationFixture} from './publication-fixture'
import {initPreview,localDatabase} from '../admin-publisher/local-database'
import {LocalPublicationAssets} from '../admin-publisher/assets'
import {publishReports} from '../admin-publisher/runner'
import trialWorker from '../admin-publisher/trial-worker'

test('scoped export rejects expired grants and non-selected PDF access',async t=>{
  const f=await publicationFixture();t.after(()=>f.sqlite.close())
  const a=await f.upload(),b=await f.upload(1)
  await f.change(a.draft,{type:'approve',reviewed:true});await f.change(b.draft,{type:'approve',reviewed:true})
  f.env.REPORT_EXPORT_SCOPE=JSON.stringify({ids:[a.draft.id.replaceAll('-','')],expires:f.now()+10000})
  const reports=(await f.source().snapshot()).reports
  assert.equal(reports.length,1);assert.equal(reports[0].id,a.draft.id.replaceAll('-',''))
  const unauthorized=await f.request(`${f.env.ORIGIN}/api/publisher/reports/${b.draft.id.replaceAll('-','')}/2/pdf/0`,{headers:{Authorization:`Bearer ${f.env.REPORT_EXPORT_KEY}`}})
  assert.equal(unauthorized.status,404)
  f.tick(11000)
  await assert.rejects(f.source().snapshot(),/404/)
  delete f.env.REPORT_EXPORT_SCOPE
  await assert.rejects(f.source().snapshot(),/404/)
})

test('online trial reads only its snapshot, blocks mutations, expires and enforces an independent daily budget',async t=>{
  const f=await publicationFixture(),local=localDatabase(':memory:'),root=await mkdtemp(path.join(tmpdir(),'smp-online-trial-'))
  t.after(async()=>{f.sqlite.close();local.sqlite.close();await rm(root,{recursive:true,force:true})})
  await initPreview(local.sqlite)
  const assets=new LocalPublicationAssets(root);await assets.init()
  const upload=await f.upload(),approved=await f.change(upload.draft,{type:'approve',reviewed:true})
  await publishReports(f.source(),local.db,assets)
  Object.assign(globalThis,{__SMP_FIXTURE__:true})
  const origin='https://smp-report-publication-trial.smp-website.workers.dev'
  const env={CMS_DB:local.db,ASSETS:{fetch:assets.fetch},TRIAL_ORIGIN:origin,TRIAL_VALID_UNTIL:String(Date.now()+3600000)}
  const get=(p:string,method='GET')=>trialWorker.fetch(new Request(origin+p,{method}),env,{waitUntil(){}})
  const list=await get('/api/catalog/research')
  assert.equal(list.status,200);assert.equal(list.headers.get('X-Robots-Tag'),'noindex, nofollow, noarchive')
  assert.equal((await list.json() as any).items[0].company,'HPSP')
  const download=await get(`/api/content/research/${approved.id.replaceAll('-','')}/pdf?download=1`)
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()),upload.pdf)
  assert.equal((await get('/api/notion/webhook','POST')).status,405)
  for(const p of ['/api/catalog/notice','/api/publisher/reports','/_reader-pdfs/test.bin','/%5freader-pdfs/test.bin'])assert.equal((await get(p)).status,404)
  assert.match(await (await get('/robots.txt')).text(),/Disallow: \//)
  env.TRIAL_VALID_UNTIL='1';assert.equal((await get('/api/catalog/research')).status,410)
  env.TRIAL_VALID_UNTIL=String(Date.now()+3600000)
  local.sqlite.prepare("UPDATE free_budget SET count=500 WHERE key LIKE 'report-trial-day:%'").run()
  assert.equal((await get('/api/catalog/research')).status,429)
  assert.equal((await trialWorker.fetch(new Request('https://pnusmp.com/api/catalog/research'),env,{waitUntil(){}})).status,404)
})
