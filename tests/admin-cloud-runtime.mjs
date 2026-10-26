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
  modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
  cf:false,host:'127.0.0.1',port:0,d1Databases:{ADMIN_DB:'test-admin'},
  bindings:{ORIGIN:origin,SESSION_SIGNING_KEY:'a'.repeat(64),SETUP_TOKEN_HASH:createHash('sha256').update(setupToken).digest('hex')},
}))
try {
  const db = await mf.getD1Database('ADMIN_DB')
  const schema = await readFile(new URL('../admin-cloud/schema.sql',import.meta.url),'utf8')
  await db.batch(schema.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)))
  assert.equal((await mf.dispatchFetch(origin+'/api/drafts')).status,401)
  const jar = cookieJar(), device = authenticator()
  let csrf = ''
  const call = async (path,method='GET',data) => {
    const binary = data instanceof Uint8Array
    const response = await mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,Cookie:jar.read(),'X-CSRF-Token':csrf,...(data?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},body:data?(binary?data:JSON.stringify(data)):undefined})
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
  console.log(JSON.stringify({result:'pass',runtime:'workerd',storage:'isolated local D1',pdfBytes:source.length,chunks:manifest.parts,coverType,recoveredLostResponses:2,roundTripMs:Math.round(performance.now()-started),downloadBytesMatch:true}))
} finally { await mf.dispose() }
