// Exercise native workerd fetch, rather than injecting a JavaScript mock into
// DriveConnection. All outbound requests terminate at the local Google fixture.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
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
  cf: false, host: '127.0.0.1', port: 0, d1Databases: { ADMIN_DB: 'test-drive-admin' },
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
} finally { await mf.dispose() }
