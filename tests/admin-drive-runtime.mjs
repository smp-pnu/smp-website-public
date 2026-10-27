// Exercise native workerd fetch, rather than injecting a JavaScript mock into
// DriveConnection. All outbound requests terminate at the local Google fixture.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { authenticator, cookieJar } from './admin-passkey-fixture.mjs'
import { MockDrive } from './admin-drive-fixture.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare')
const origin = 'https://admin.pnusmp.com', setupToken = 'b'.repeat(64), google = new MockDrive()
const bundle = await build({ entryPoints: ['admin-cloud/worker.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['node:*'], target: 'es2022' })
const mf = new Miniflare(convertV4MiniflareOptions({
  ratelimits:{AUTH_LIMITER:{namespace_id:'2026102701',simple:{limit:20,period:60}}},
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
  cf: false, host: '127.0.0.1', port: 0, d1Databases: { ADMIN_DB: 'test-drive-admin' },
  bindings: { ORIGIN: origin, DRIVE_ACCOUNT_EMAIL: google.email, SESSION_SIGNING_KEY: 'a'.repeat(64), SETUP_TOKEN_HASH: createHash('sha256').update(setupToken).digest('hex') },
  outboundService: async request => google.fetch(request.url, {
    method: request.method, headers: request.headers,
    ...(request.method === 'GET' ? {} : { body: await request.text() }),
  }),
}))
try {
  const db = await mf.getD1Database('ADMIN_DB')
  const schema = await readFile(new URL('../admin-cloud/schema.sql', import.meta.url), 'utf8')
  await db.batch(schema.split(';').filter(sql => sql.trim()).map(sql => db.prepare(sql)))
  const guards = await readFile(new URL('../admin-cloud/history-budget.sql', import.meta.url), 'utf8')
  await db.batch(guards.split('-- statement').map(sql => db.prepare(sql)))
  const device = authenticator(), jar = cookieJar()
  let csrf = ''
  const call = async (path, method = 'GET', data, redirect = 'follow') => {
    const response = await mf.dispatchFetch(origin + path, {
      method, redirect, headers: { Origin: origin, 'CF-Connecting-IP':'192.0.2.1', Cookie: jar.read(), 'X-CSRF-Token': csrf, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined,
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
  assert.ok(google.calls.some(call => call.url === 'https://oauth2.googleapis.com/token'))
  console.log('PASS: native workerd fetch, OAuth exchange, account verification, private folder confirmation and quota')
} finally { await mf.dispose() }
