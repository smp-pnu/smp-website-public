// Exercise native workerd fetch, rather than injecting a JavaScript mock into
// DriveConnection. All outbound requests terminate at the local Google fixture.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { authenticator, cookieJar } from './admin-passkey-fixture.mjs'
import { MockDrive } from './admin-drive-fixture.ts'
import { samplePdf } from '../admin-lab/sample.ts'
import { emptyFields } from '../admin-lab/model.ts'
import { chunkBytes, fileIdentity, sha256 } from '../admin-cloud/protocol.ts'
import sharp from 'sharp'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare')
const origin = 'https://admin.pnusmp.com', setupToken = 'b'.repeat(64), google = new MockDrive()
const bundle = await build({ entryPoints: ['admin-cloud/worker.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['node:*'], target: 'es2022' })
const runtimeOptions = {
  ratelimits:{AUTH_LIMITER:{namespace_id:'2026102701',simple:{limit:20,period:60}}},
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
  cf: false, host: '127.0.0.1', port: 0, d1Databases: { ADMIN_DB: 'test-drive-admin', CMS_DB:'test-drive-cms' },
  bindings: { ORIGIN: origin, DRIVE_ACCOUNT_EMAIL: google.email, SESSION_SIGNING_KEY: 'a'.repeat(64), SETUP_TOKEN_HASH: createHash('sha256').update(setupToken).digest('hex'), REPORT_EXPORT_KEY: 'e'.repeat(64) },
  outboundService: async request => google.fetch(request.url, {
    method: request.method, headers: request.headers,
    ...(request.method === 'GET' ? {} : { body: request.method === 'PUT' ? new Uint8Array(await request.arrayBuffer()) : await request.text() }),
  }),
}
const mf = new Miniflare(convertV4MiniflareOptions(runtimeOptions))
try {
  const db = await mf.getD1Database('ADMIN_DB')
  const schema = await readFile(new URL('../admin-cloud/schema.sql', import.meta.url), 'utf8')
  await db.batch(schema.split(';').filter(sql => sql.trim()).map(sql => db.prepare(sql)))
  const guards = await readFile(new URL('../admin-cloud/history-budget.sql', import.meta.url), 'utf8')
  await db.batch(guards.split('-- statement').map(sql => db.prepare(sql)))
  let cms=await mf.getD1Database('CMS_DB')
  for(const file of [...(await readdir('cloudflare/migrations')).sort().map(f=>'cloudflare/migrations/'+f),'cms/schema.sql']) {
    const schema=await readFile(file,'utf8')
    const statements=schema.includes('-- statement')?schema.split('-- statement'):schema.replace(/^--.*$/gm,'').split(';')
    await cms.batch(statements.filter(s=>s.replace(/^--.*$/gm,'').trim()).map(s=>cms.prepare(s)))
  }
  await cms.batch((await readFile('cms/budget.sql','utf8')).split('-- statement').filter(s=>s.trim()).map(s=>cms.prepare(s)))
  await cms.prepare('CREATE TABLE IF NOT EXISTS free_admin_config(name TEXT PRIMARY KEY,value TEXT NOT NULL)').run()
  await cms.prepare("INSERT INTO free_controls(name,until_at) VALUES('cms-source-admin',1)").run()
  const device = authenticator(), jar = cookieJar()
  let csrf = ''
  const call = async (path, method = 'GET', data, redirect = 'follow') => {
    const binary = data instanceof Uint8Array
    const response = await mf.dispatchFetch(origin + path, {
      method, redirect, headers: { Origin: origin, 'CF-Connecting-IP':'192.0.2.1', Cookie: jar.read(), 'X-CSRF-Token': csrf, ...(data ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}) },
      body: data ? binary ? data : JSON.stringify(data) : undefined,
    })
    jar.set(response)
    assert.ok(response.status < 400, `${path}: ${response.status} ${response.status >= 400 ? await response.text() : ''}`)
    return response
  }
  const options = await (await call('/api/auth/register/options', 'POST', { mode: 'setup', token: setupToken })).json()
  const registered = await (await call('/api/auth/register/verify', 'POST', { response: device.register(options, origin) })).json()
  csrf = registered.session.csrf
  await call('/api/storage/drive/configure', 'POST', { web: { client_id: '123-test.apps.googleusercontent.com', client_secret: 'local-test-secret-only', redirect_uris: [origin + '/api/storage/drive/callback'] } })
  const { url } = await (await call('/api/storage/drive/start', 'POST')).json()
  const state = new URL(url).searchParams.get('state')
  const callback = await call(`/api/storage/drive/callback?state=${state}&code=local-test-code`, 'GET', undefined, 'manual')
  assert.equal(callback.status, 303)
  assert.equal(google.files.size, 0, 'OAuth callback must not write to Drive before confirmation')
  await call('/api/storage/drive/confirm', 'POST')
  const status = await (await call('/api/storage/status')).json()
  assert.equal(status.connected, true)
  assert.equal(status.email, google.email)
  assert.equal(google.files.size, 1)
  const quota = await (await call('/api/storage/drive/quota')).json()
  assert.equal(quota.remaining, google.quotaRemaining)
  const capacity=await(await call('/api/dashboard/drive')).json()
  assert.equal(capacity.value.quota.remaining,google.quotaRemaining)
  const reads=google.calls.filter(c=>c.url.endsWith('/about?fields=storageQuota')).length
  assert.deepEqual(await(await call('/api/dashboard/drive')).json(),capacity)
  assert.equal(google.calls.filter(c=>c.url.endsWith('/about?fields=storageQuota')).length,reads)
  assert.ok(!JSON.stringify(capacity).includes('test-access')&&!JSON.stringify(capacity).includes('test-refresh'))
  assert.ok(google.calls.some(call => call.url === 'https://oauth2.googleapis.com/token'))
  console.log('PASS: native workerd fetch, OAuth exchange, account verification, private folder confirmation and quota')

  const file = samplePdf(0), pdf = new Uint8Array(await file.arrayBuffer())
  const cover = new Uint8Array(await sharp({create:{width:50,height:70,channels:3,background:'white'}}).webp().toBuffer())
  const fields = {...emptyFields(), title:'Local publication test', company:'HPSP', ticker:'403870', date:'2020-01-01', semester:'2020-1', author:'Test team', notRated:true}
  const upload = await (await call('/api/uploads','POST',{filename:file.name,fileBytes:pdf.length,hash:await fileIdentity(pdf),rawSha256:await sha256(pdf),coverBytes:cover.length,pages:3,fields,evidence:[],warnings:[]})).json()
  for(const [kind,bytes] of [['pdf',pdf],['cover',cover]]) for(let offset=0;offset<bytes.length;offset+=chunkBytes)
    await call(`/api/uploads/${upload.id}/${kind}/${offset/chunkBytes}`,'PUT',bytes.slice(offset,offset+chunkBytes))
  const draft = await (await call(`/api/uploads/${upload.id}/finish`,'POST')).json()
  await mf.setOptions(convertV4MiniflareOptions({...runtimeOptions,bindings:{...runtimeOptions.bindings,REPORT_EXPORT_SCOPE:JSON.stringify({ids:[draft.id.replaceAll('-','')],expires:Date.now()+3600000})}}))
  cms=await mf.getD1Database('CMS_DB')
  const exported = path => mf.dispatchFetch(origin + path,{headers:{Authorization:`Bearer ${'e'.repeat(64)}`}})
  assert.equal((await mf.dispatchFetch(origin+'/api/publisher/reports')).status,401)
  assert.equal((await (await exported('/api/publisher/reports')).json()).reports.length,0)
  await call(`/api/drafts/${draft.id}`,'PATCH',{revision:draft.revision,command:{type:'approve',reviewed:true}})
  const manifest = await (await exported('/api/publisher/reports')).json()
  assert.equal(manifest.reports.length,1)
  const approved = manifest.reports[0]
  assert.equal(approved.fields.title,fields.title)
  assert.ok(!JSON.stringify(manifest).includes('googleusercontent'))
  const part = await exported(`/api/publisher/reports/${approved.id}/${approved.revision}/pdf/0`)
  assert.equal(part.status,200)
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()),pdf.slice(0,chunkBytes))
  assert.ok([...google.files.values()].every(file => file.permissions.every(permission => permission.type==='user' && permission.role==='owner')))
  console.log('PASS: native workerd private PDF upload, approval-only export, authenticated original bytes and unchanged Drive privacy')

  const data=async(...args)=>(await call(...args)).json()
  const imported=await data('/api/cms/import-upload','POST',{id:draft.id})
  assert.equal(imported.approvedRevision,null,'Input review must not publish a report')
  assert.equal(imported.draft.item.title,fields.title)
  const links=await data('/api/cms/upload-links')
  assert.equal(links.length,1);assert.equal(links[0].uploadId,approved.id)
  assert.equal((await data('/api/cms/import-upload','POST',{id:draft.id})).revision,imported.revision,'Retry must be idempotent')
  const edited=await data('/api/cms/entry/'+imported.id,'PUT',{revision:imported.revision,payload:{...imported.draft,item:{...imported.draft.item,title:'Edited local report'}}})
  const published=await data(`/api/cms/entry/${edited.id}/approve`,'POST',{revision:edited.revision})
  assert.equal(published.pending,true,'Original PDF must queue preparation before publication')
  assert.equal((await cms.prepare('SELECT count(*) AS n FROM cms_jobs WHERE id=?').bind(edited.id).first()).n,1)
  let trashed=await data(`/api/cms/entry/${edited.id}/trash`,'POST',{revision:published.revision})
  assert.ok(trashed.trashedAt);assert.equal((await data('/api/cms/upload-links'))[0].trashedAt,trashed.trashedAt)
  assert.ok((await data(`/api/cms/entry/${edited.id}/restore`,'POST',{revision:trashed.revision})).trashedAt===null)
  assert.deepEqual(new Uint8Array(await (await exported(`/api/publisher/reports/${approved.id}/${approved.revision}/pdf/0`)).arrayBuffer()),pdf.slice(0,chunkBytes),'CMS trash/restore must preserve original bytes')

  const notice={item:{id:'',kind:'notice',title:'Local notice',date:'2026-10-28',summary:'Local test',category:'공지',author:'SMP',pinned:false,externalUrl:null,attachments:[]},cover:null,blocks:[]}
  const first=await data('/api/cms/notice','POST',notice),second=await data('/api/cms/notice','POST',{...notice,item:{...notice.item,title:'Second local notice'}})
  await data(`/api/cms/entry/${second.id}/move`,'POST',{revision:second.revision,target:first.id,placement:'before'})
  assert.equal((await data('/api/cms/notice')).items[0].id,second.id)
  for(const row of [first,second]){
    let current=await data('/api/cms/entry/'+row.id)
    current=await data(`/api/cms/entry/${row.id}/approve`,'POST',{revision:current.revision});assert.ok(current.approvedRevision)
    current=await data(`/api/cms/entry/${row.id}/withdraw`,'POST',{revision:current.revision});assert.equal(current.approvedRevision,null)
    current=await data(`/api/cms/entry/${row.id}/trash`,'POST',{revision:current.revision});assert.ok(current.trashedAt)
    current=await data(`/api/cms/entry/${row.id}/restore`,'POST',{revision:current.revision});assert.equal(current.trashedAt,null)
  }
  const member=await data('/api/cms/members','POST',{item:{id:'',name:'가상회원',generation:40,group:'members',department:'시험학과',year:'26',roles:['회장']},blocks:[],cover:null})
  assert.equal((await data('/api/cms/member-cohorts')).items[0].generation,40)
  const changed=await data(`/api/cms/entry/${member.id}`,'PUT',{revision:member.revision,payload:{...member.draft,item:{...member.draft.item,name:'수정회원',roles:['부회장']}}})
  assert.equal(changed.draft.item.roles[0],'부회장')
  const recruitment=await data('/api/cms/recruitment')
  assert.equal((await data('/api/cms/recruitment','PUT',{...recruitment,period:'2027년 1~2월'})).period,'2027년 1~2월')
  assert.equal((await mf.dispatchFetch(origin+'/api/cms/upload-links')).status,401)
  console.log('PASS: authenticated upload-to-CMS handoff, duplicate retry, edit, publish queue, trash/restore, private source preservation, notice order/CRUD, cohort and recruitment APIs')

  // Optional UI fixture: all data and OAuth responses above are synthetic and
  // local. It never reads production credentials, APIs, Drive or content.
  if(process.env.SMP_WORKFLOW_BROWSER==='1') {
    const uiRoot='/private/tmp/smp-workflow-ui';await mkdir(uiRoot,{recursive:true})
    await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./admin-lab/app';import{CloudAuthGate}from'./admin-lab/cloud-auth';import{ConfirmationProvider}from'./admin-lab/confirm';import'./admin-lab/style.css';createRoot(document.getElementById('root')).render(<ConfirmationProvider><CloudAuthGate>{(session,logout,security)=><App username={session.username} onLogout={logout} security={security}/>}</CloudAuthGate></ConfirmationProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:uiRoot+'/app.js',format:'esm',platform:'browser',jsx:'automatic',define:{'import.meta.env.MODE':'"admin-cloud"','process.env.NODE_ENV':'"production"'}})
    await writeFile(uiRoot+'/index.html','<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SMP 가상 데이터 기능 시험</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>')
    await writeFile('/private/tmp/smp-workflow-synthetic.pdf',new Uint8Array(await samplePdf(1).arrayBuffer()))
    let storageView='normal'
    const requests=[]
    const server=createServer(async(req,res)=>{
      try{
        const url=new URL(req.url,'http://127.0.0.1:3023')
        requests.push(req.method+' '+url.pathname)
        if(url.pathname==='/fixture/status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({requests,driveFiles:google.files.size}))}
        if(url.pathname==='/fixture/storage'){storageView=url.searchParams.get('state')??'normal';return res.end('OK')}
        if(url.pathname.startsWith('/api/')) {
          const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks)
          const response=await mf.dispatchFetch(origin+url.pathname+url.search,{method:req.method,redirect:'manual',headers:{...req.headers,host:'admin.pnusmp.com',origin,Cookie:jar.read(),'CF-Connecting-IP':'192.0.2.1'},...(body.length?{body}:{})})
          jar.set(response)
          res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie'&&k!=='content-encoding'&&k!=='content-length')))
          if(url.pathname==='/api/storage/status'&&storageView!=='normal')return res.end(JSON.stringify({...await response.json(),connected:storageView==='pending',pending:storageView==='pending'}))
          return res.end(Buffer.from(await response.arrayBuffer()))
        }
        const root=url.pathname.startsWith('/pdfjs/')?path.resolve('dist/admin-cloud/assets'):uiRoot,file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname))
        if(!file.startsWith(root+path.sep))throw Error('Invalid asset path')
        const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.woff2':'font/woff2'}
        res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file))
      }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}
    }).listen(3023,'127.0.0.1',()=>console.log('LOCAL SYNTHETIC UI FIXTURE: http://127.0.0.1:3023'))
    await new Promise(resolve=>process.once('SIGINT',()=>server.close(resolve)))
  }
} finally { await mf.dispose() }
