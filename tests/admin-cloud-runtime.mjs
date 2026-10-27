// Real workerd + local D1. No Cloudflare credentials, live endpoints or auth bypasses.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import sharp from 'sharp'
import { fileIdentity, chunkBytes } from '../admin-cloud/protocol.ts'
import { authenticator, cookieJar } from './admin-passkey-fixture.mjs'
import { createHash } from 'node:crypto'
import { emptyFields } from '../admin-lab/model.ts'
import { insertDraft } from '../admin-lab/cloud-storage.ts'
import { setApiSession } from '../admin-lab/server-storage.ts'
const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')
const origin = 'https://admin.pnusmp.com'
const setupToken = 'b'.repeat(64)
const bundle = await build({entryPoints:['admin-cloud/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],external:['node:*'],target:'es2022'})
const mf = new Miniflare(convertV4MiniflareOptions({
  ratelimits:{AUTH_LIMITER:{namespace_id:'2026102701',simple:{limit:20,period:60}}},
  modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
  cf:false,host:'127.0.0.1',port:0,d1Databases:{ADMIN_DB:'test-admin'},
  bindings:{ORIGIN:origin,SESSION_SIGNING_KEY:'a'.repeat(64),SETUP_TOKEN_HASH:createHash('sha256').update(setupToken).digest('hex')},
}))
try {
  const db = await mf.getD1Database('ADMIN_DB')
  const schema = await readFile(new URL('../admin-cloud/schema.sql',import.meta.url),'utf8')
  await db.batch(schema.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
  const guards = await readFile(new URL('../admin-cloud/history-budget.sql',import.meta.url),'utf8')
  await db.batch(guards.split('-- statement').map(sql=>db.prepare(sql)))
  assert.equal((await mf.dispatchFetch(origin+'/api/drafts')).status,401)
  const jar = cookieJar(), device = authenticator()
  let csrf = ''
  const call = async (path,method='GET',data) => {
    const binary = data instanceof Uint8Array
    const response = await mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1',Cookie:jar.read(),'X-CSRF-Token':csrf,...(data?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},body:data?(binary?data:JSON.stringify(data)):undefined})
    assert.equal(response.status<300,true,`${method} ${path}: ${response.status} ${response.status>=300?await response.text():''}`)
    jar.set(response); return response
  }
  const options = await (await call('/api/auth/register/options','POST',{mode:'setup',token:setupToken})).json()
  const registered = await (await call('/api/auth/register/verify','POST',{response:device.register(options,origin)})).json()
  assert.match(registered.recoveryCode,/^[a-f0-9]{64}$/)
  csrf = registered.session.csrf
  await call('/api/logout','POST')
  const login = await (await call('/api/auth/login/options','POST',{})).json()
  csrf = (await (await call('/api/auth/login/verify','POST',{response:device.authenticate(login,origin)})).json()).session.csrf
  // An absent AI binding must leave uploads available. No remote inference is
  // configured in this local runtime; the model boundary is mocked in unit tests.
  const metadata = await (await call('/api/metadata/extract','POST',{reviewed:true,hash:'a'.repeat(64),pages:['Test investment report, company (123456), source text long enough for extraction.']})).json()
  assert.deepEqual(metadata.candidates,[]); assert.ok(metadata.warning)
  // Optional real PDF path permits a local end-to-end transport check without publishing it.
  const source = process.argv[2] ? new Uint8Array(await readFile(process.argv[2])) : new Uint8Array(32*1024*1024).fill(32)
  if (!process.argv[2]) { source.set(new TextEncoder().encode('%PDF-1.7\n'));source.set(new TextEncoder().encode('\n%%EOF\n'),source.length-7) }
  const cover = new Uint8Array(process.argv[3] ? await readFile(process.argv[3]) : await sharp({create:{width:1177,height:1700,channels:3,background:'white'}}).webp().toBuffer())
  const pages = process.argv[4] ? Number(process.argv[4]) : 27
  const started = performance.now()
  const hash = await fileIdentity(source), originalFetch = globalThis.fetch
  let chunkResponseLost = false, finishResponseLost = false, saved
  const draft = { id:'runtime-client',hash,filename:'runtime-test.pdf',fileBytes:source.length,storedBytes:source.length+cover.length,pages,fields:emptyFields(),evidence:[],warnings:[],revision:1,approvedRevision:null,approvedAt:null,createdAt:'',updatedAt:'',trashedAt:null }
  setApiSession({ username:'smp-admin',csrf })
  try {
    globalThis.fetch = async (input,options) => {
      if(typeof input!=='string' || !input.startsWith('/api/')) return originalFetch(input,options)
      const headers = new Headers(options.headers); headers.set('Origin',origin); headers.set('Cookie',jar.read())
      const response = await mf.dispatchFetch(origin+input,{...options,headers})
      jar.set(response)
      // The server committed the bytes, but the browser lost the response.
      if(response.ok && input.endsWith('/pdf/0') && !chunkResponseLost) { chunkResponseLost=true; throw new TypeError('Load failed') }
      if(response.ok && input.endsWith('/finish') && !finishResponseLost) { finishResponseLost=true; throw new TypeError('Load failed') }
      return response
    }
    saved = await insertDraft(draft,{id:draft.id,pdf:new Blob([source]),cover:new Blob([cover])})
  } finally { globalThis.fetch=originalFetch;setApiSession(null) }
  assert.ok(chunkResponseLost && finishResponseLost)
  const {id} = saved
  assert.equal((await (await call('/api/drafts')).json()).length,1)
  const manifest = await (await call(`/api/drafts/${id}/pdf`)).json(), downloaded=[]
  for(let i=0;i<manifest.parts;i++) downloaded.push(Buffer.from(await (await call(`/api/drafts/${id}/pdf/${i}`)).arrayBuffer()))
  assert.deepEqual(Buffer.concat(downloaded),Buffer.from(source))
  const coverResponse = await call(`/api/drafts/${id}/cover`)
  const coverType = (await sharp(cover).metadata()).format === 'jpeg' ? 'image/jpeg' : 'image/webp'
  assert.equal(coverResponse.headers.get('Content-Type'),coverType)
  assert.deepEqual(Buffer.from(await coverResponse.arrayBuffer()),Buffer.from(cover))
  assert.equal((await mf.dispatchFetch(origin+`/api/drafts/${id}/pdf/0`)).status,401)
  const order=await(await call('/api/reports/order')).json()
  await call('/api/reports/order','PUT',{revision:order.revision,ids:[id]})
  await call('/api/reports/batch','POST',{items:[{id,revision:saved.revision}],action:{type:'classify',field:'semester',value:'2026-2'}})
  const nextSource=new TextEncoder().encode('%PDF-1.7\nLocal replacement test\n%%EOF\n')
  const replacement=await(await call('/api/uploads','POST',{hash:await fileIdentity(nextSource),filename:'replacement.pdf',fileBytes:nextSource.length,coverBytes:cover.length,pages:1,fields:draft.fields,evidence:[],warnings:[],replace:{id,revision:2}})).json()
  await call(`/api/uploads/${replacement.id}/pdf/0`,'PUT',nextSource)
  for(let offset=0;offset<cover.length;offset+=chunkBytes)await call(`/api/uploads/${replacement.id}/cover/${offset/chunkBytes}`,'PUT',cover.slice(offset,offset+chunkBytes))
  const replaced=await(await call(`/api/uploads/${replacement.id}/finish`,'POST')).json()
  assert.equal(replaced.id,id);assert.equal(replaced.revision,3);assert.equal(replaced.fields.semester,'2026-2')
  assert.equal((await(await call(`/api/uploads/${replacement.id}/finish`,'POST')).json()).id,id)
  assert.deepEqual(new Uint8Array(await(await call(`/api/drafts/${id}/pdf/0`)).arrayBuffer()),nextSource)
  const notice=await(await call('/api/notices','POST',{title:'Runtime notice',category:'Test',date:'2026-10-26',pinned:false,blocks:[]})).json()
  const secondNotice=await(await call('/api/notices','POST',{title:'Second notice',category:'Test',date:'2026-10-27',pinned:false,blocks:[]})).json()
  const noticeOrder=await(await call('/api/notices/order')).json()
  assert.deepEqual(noticeOrder.ids,[secondNotice.id,notice.id])
  await call('/api/notices/order','PUT',{revision:noticeOrder.revision,ids:[notice.id,secondNotice.id]})
  assert.deepEqual((await(await call('/api/notices/order')).json()).ids,[notice.id,secondNotice.id])
  await call(`/api/notices/${secondNotice.id}`,'PATCH',{revision:1,action:'trash'})
  assert.deepEqual((await(await call('/api/notices/order')).json()).ids,[notice.id])
  await call(`/api/notices/${secondNotice.id}`,'PATCH',{revision:2,action:'remove'})
  const asset=await(await call(`/api/notices/${notice.id}/images`,'POST',cover)).json()
  const body={...notice,blocks:[{id:crypto.randomUUID(),type:'image',assetId:asset.id,text:'Test photo'}]}
  await call(`/api/notices/${notice.id}`,'PATCH',{revision:1,action:'edit',fields:body})
  await call(`/api/notices/${notice.id}`,'PATCH',{revision:2,action:'approve',reviewed:true})
  assert.deepEqual(new Uint8Array(await(await call(`/api/notice-assets/${asset.id}`)).arrayBuffer()),cover)
  await call(`/api/notices/${notice.id}`,'PATCH',{revision:3,action:'trash'})
  await call(`/api/notices/${notice.id}`,'PATCH',{revision:4,action:'remove'})
  await call('/api/reports/batch','POST',{items:[{id,revision:3}],action:{type:'trash'}})
  await call('/api/reports/batch','POST',{items:[{id,revision:4}],action:{type:'remove'}})
  assert.equal((await db.prepare('SELECT count(*) AS n FROM chunks').first()).n,0)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM notice_assets').first()).n,0)
  const remaining=await(await call('/api/library/status')).json();assert.ok(remaining.bytes>=source.length+cover.length)
  assert.equal((await db.prepare('SELECT rows FROM history_budget').first()).rows,0)
  console.log(JSON.stringify({managementFlows:'order/bulk/replace/notice/images/purge',result:'pass' ,runtime:'workerd',storage:'isolated local D1',pdfBytes:source.length,chunks:manifest.parts,coverType,recoveredLostResponses:2,roundTripMs:Math.round(performance.now()-started),downloadBytesMatch:true}))
} finally { await mf.dispose() }
