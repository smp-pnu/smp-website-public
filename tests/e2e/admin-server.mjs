// Disposable HTTPS replica: the actual Worker, migrations and UI. No production
// credentials, authentication shortcuts, remote databases or Google requests.
import { createServer } from 'node:https'
import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { build as buildUi } from 'vite'
import { MockDrive } from '../admin-drive-fixture.ts'

const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare')
const origin = 'https://localhost:3019'
const root = path.resolve('dist/browser-qa/admin')
execFileSync(process.execPath, ['scripts/admin-cloud.mjs', 'build'], { stdio: 'inherit' })
// The shipped UI intentionally refuses every hostname except admin.pnusmp.com.
// Adapt that one client-side build guard for this local replica; authentication,
// cookies, CSRF, API Origin checks and all screen components stay unchanged.
await buildUi({ configFile: 'admin-cloud/vite.config.ts', build: { outDir: root }, plugins: [{
  name: 'qa-loopback-build-origin',
  transform(code, id) {
    if (!id.endsWith('/admin-lab/mode.ts')) return
    const guard = 'url.origin === "https://admin.pnusmp.com"'
    if (!code.includes(guard)) throw Error('Review the production origin guard before updating QA')
    return code.replace(guard, `url.origin === ${JSON.stringify(origin)}`)
  },
}] })
const bundle = await build({ entryPoints: ['admin-cloud/worker.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['node:*'], target: 'es2022' })
const temporary = await mkdtemp(path.join(tmpdir(), 'smp-browser-qa-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${temporary}/key.pem`, '-out', `${temporary}/cert.pem`, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' })
let mf, google
async function reset() {
  if (mf) await mf.dispose()
  google = new MockDrive()
  mf = new Miniflare(convertV4MiniflareOptions({
    ratelimits: { AUTH_LIMITER: { namespace_id: '2026102701', simple: { limit: 20, period: 60 } } },
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
    cf: false, host: '127.0.0.1', port: 0,
    d1Databases: { ADMIN_DB: 'browser-qa-admin', CMS_DB: 'browser-qa-cms' },
    bindings: { ORIGIN: origin, DRIVE_ACCOUNT_EMAIL: google.email, SESSION_SIGNING_KEY: randomBytes(32).toString('hex'), SETUP_TOKEN_HASH: createHash('sha256').update('b'.repeat(64)).digest('hex') },
    outboundService: async request => google.fetch(request.url, {
      method: request.method, headers: request.headers,
      ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: request.method === 'PUT' ? new Uint8Array(await request.arrayBuffer()) : await request.text() }),
    }),
  }))
  const db = await mf.getD1Database('ADMIN_DB'), cms = await mf.getD1Database('CMS_DB')
  async function apply(database, file) {
    const sql = await readFile(file, 'utf8')
    const statements = sql.includes('-- statement') ? sql.split('-- statement') : sql.replace(/^--.*$/gm, '').split(';')
    await database.batch(statements.filter(s => s.replace(/^--.*$/gm, '').trim()).map(s => database.prepare(s)))
  }
  for (const file of ['admin-cloud/schema.sql', 'admin-cloud/history-budget.sql']) await apply(db, file)
  for (const file of [...(await readdir('cloudflare/migrations')).sort().map(f => `cloudflare/migrations/${f}`), 'cms/schema.sql', 'cms/budget.sql']) await apply(cms, file)
  await cms.prepare('CREATE TABLE IF NOT EXISTS free_admin_config(name TEXT PRIMARY KEY,value TEXT NOT NULL)').run()
  await cms.prepare("INSERT INTO free_controls(name,until_at) VALUES('cms-source-admin',1)").run()
}
await reset()
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp' }
const server = createServer({ key: await readFile(`${temporary}/key.pem`), cert: await readFile(`${temporary}/cert.pem`) }, async (req, res) => {
  try {
    if (req.headers.host !== 'localhost:3019') { res.writeHead(403); return res.end() }
    const url = new URL(req.url, origin)
    res.setHeader('Cache-Control', 'no-store')
    if (url.pathname === '/__qa/health') return res.end('SMP disposable browser QA')
    if (url.pathname.startsWith('/__qa/')) {
      if (req.headers['x-smp-qa'] !== 'local-only' || req.headers.origin && req.headers.origin !== origin) { res.writeHead(403); return res.end() }
      if (url.pathname === '/__qa/reset' && req.method === 'POST') { await reset(); return res.end('reset') }
      if (url.pathname === '/__qa/files' && req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify([...google.files.values()].map(f => ({ name: f.name, bytes: f.data.length, trashed: f.trashed, permissions: f.permissions })))) }
      res.writeHead(404); return res.end()
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024 * 1024) throw Error('Fixture body too large'); chunks.push(chunk) }
      const response = await mf.dispatchFetch(url.href, { method: req.method, redirect: 'manual', headers: { ...req.headers, 'CF-Connecting-IP': '192.0.2.1' }, ...(size ? { body: Buffer.concat(chunks) } : {}) })
      for (const [k, v] of response.headers) if (!['set-cookie', 'content-length', 'content-encoding'].includes(k)) res.setHeader(k, v)
      const cookies = response.headers.getSetCookie()
      if (cookies.length) res.setHeader('set-cookie', cookies)
      res.statusCode = response.status
      return res.end(Buffer.from(await response.arrayBuffer()))
    }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)))
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end() }
    try { const bytes = await readFile(file); res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream'); res.end(bytes) }
    catch { res.writeHead(404); res.end('Not found') }
  } catch (error) { console.error(error); res.writeHead(500); res.end('Local fixture error') }
})
server.listen(3019, '127.0.0.1', () => console.log('Disposable admin QA ready at ' + origin))
let closing = false
async function close() { if (closing) return; closing = true; server.closeAllConnections(); server.close(); await mf.dispose(); await rm(temporary, { recursive: true, force: true }); process.exit(0) }
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, close)
