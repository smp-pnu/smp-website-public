// Separate trial build/deploy. Never loads .env or the production deployment config.
import path from 'node:path'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const root = path.resolve(import.meta.dirname, '..')
const mode = process.argv[2]
if (!['build', 'deploy', 'dry-run'].includes(mode) || process.argv.length !== 3) throw Error('Use build, deploy, or dry-run only')
const configPath = path.join(root, 'dist/admin-cloud/wrangler.json')
const name = 'smp-pdf-admin-trial'
const account = 'f4dcd5f46e5ca4400e2b3449ea5e4497'
// Only this admin subdomain may attach to the trial. Never route the public site.
const origin = 'https://admin.pnusmp.com'
const routes = [{ pattern: 'admin.pnusmp.com', custom_domain: true, zone_id: '5b75442e2fa0b360c46ed97f7f8af753' }]
let target = {}
try { target = JSON.parse(await readFile(path.join(root, '.smp-tools/admin-cloud-target.json'), 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
if (target.driveAccountEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.driveAccountEmail)) throw Error('Invalid trial Drive account allowlist')
const ratelimits = [{ name: "AUTH_LIMITER", namespace_id: "2026102701", simple: { limit: 20, period: 60 } }]
const vars = { ORIGIN: origin, ...(target.driveAccountEmail ? {DRIVE_ACCOUNT_EMAIL: target.driveAccountEmail} : {}) }
if (mode === 'build') {
  const require = createRequire(import.meta.url), pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
  const assets = path.join(root, 'dist/admin-lab-assets/pdfjs')
  await mkdir(assets, { recursive: true })
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(pdfRoot, folder), path.join(assets, folder), { recursive: true })
  for (const file of ['build/pdf.worker.min.mjs', 'LICENSE']) await cp(path.join(pdfRoot, file), path.join(assets, path.basename(file)))
  const { build } = await import('vite')
  await build({ configFile: path.join(root, 'admin-cloud/vite.config.ts'), mode: 'admin-cloud' })
  // Public, static OAuth disclosure: no session, database query or third-party script.
  await cp(path.join(root, 'admin-cloud/static/privacy.html'), path.join(root, 'dist/admin-cloud/assets/privacy.html'))
  const scriptDirectory = path.join(root, 'dist/admin-cloud/assets/assets')
  const scripts = (await readdir(scriptDirectory)).filter(file => file.endsWith('.js'))
  if (scripts.length !== 1) throw Error('The cloud admin must not depend on lazy hashed JavaScript chunks')
  const entry = await readFile(path.join(scriptDirectory, scripts[0]))
  if (entry.length > 900_000 || gzipSync(entry).length > 270_000) throw Error('The isolated admin entry exceeds its single-bundle size budget')
  const config = {
    name, account_id: account, main: '../../admin-cloud/worker.ts', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'],
    workers_dev: true, preview_urls: false, routes,
    assets: { directory: './assets', binding: 'ASSETS', run_worker_first: ['/api/*', '/robots.txt'], not_found_handling: 'none' },
    d1_databases: [{ binding: 'ADMIN_DB', database_name: name, database_id: target.databaseId ?? '00000000-0000-4000-8000-000000000000' }, {binding:'CMS_DB',database_name:'smp-website-free',database_id:'c09abb5e-02cd-4277-8b19-0af0642f7cae'}],
    vars, ratelimits,
    ai: { binding: 'AI' },
    observability: { enabled: false },
  }
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
  await writeFile(path.join(root, 'dist/admin-cloud/assets/_headers'), '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n  Content-Security-Policy: default-src \'self\'; script-src \'self\' \'wasm-unsafe-eval\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' https://pnusmp.com blob: data:; font-src \'self\' data:; connect-src \'self\'; worker-src \'self\' blob:; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; frame-ancestors \'none\'\n')
} else {
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const db = config.d1_databases
  if (JSON.stringify(config.ratelimits) !== JSON.stringify(ratelimits) || config.name !== name || config.account_id !== account || JSON.stringify(config.routes) !== JSON.stringify(routes) || config.route || config.triggers || config.services || config.r2_buckets || config.kv_namespaces
    || db?.length !== 2 || db[1].binding !== 'CMS_DB' || db[1].database_name !== 'smp-website-free' || db[1].database_id !== 'c09abb5e-02cd-4277-8b19-0af0642f7cae' || db[0].binding !== 'ADMIN_DB' || db[0].database_name !== name || db[0].database_id !== target.databaseId || !target.databaseId
    || ['00000000-0000-4000-8000-000000000000', '16cf8db5-1f95-48f3-af68-b32cfa7f7908', 'c09abb5e-02cd-4277-8b19-0af0642f7cae'].includes(target.databaseId)
    || JSON.stringify(config.ai) !== JSON.stringify({binding:'AI'}) || JSON.stringify(config.vars) !== JSON.stringify(vars) || config.preview_urls !== false || config.workers_dev !== true) throw Error('Refusing a deployment outside the isolated PDF admin trial')
  if (mode === 'deploy') {
    const info = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'info', name, '--json', '--config', configPath], { cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
    if (info.status !== 0) throw Error('Could not verify the remote trial database; refusing deployment')
    const remote = JSON.parse(info.stdout)
    if (remote.name !== name || remote.uuid !== target.databaseId) throw Error('Remote database does not match the isolated trial')
    for(const file of ['cms/schema.sql','cms/budget.sql']) {
      const schema=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','smp-website-free','--remote','--file',file,'--yes','--config',configPath],{cwd:root,encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}})
      if(schema.status!==0)throw Error('Could not apply additive CMS schema; refusing deployment')
    }
    for (const file of ['admin-cloud/schema.sql','admin-cloud/history-budget.sql']) {
      const schema = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', name, '--remote', '--file', file, '--yes', '--config', configPath], { cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
      if (schema.status !== 0) throw Error('Could not apply additive schema to the isolated trial; refusing deployment')
    }
  }
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', configPath, ...(mode === 'dry-run' ? ['--dry-run'] : [])], { cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  process.exitCode = result.status ?? 1
}
