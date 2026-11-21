import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
function run(args) { const result = spawnSync(process.execPath, args, { stdio: 'inherit', env }); if (result.status !== 0) throw Error('QA fixture preparation failed') }
run(['--import', 'tsx', '--conditions=react-server', 'free/jobs/seed-fixture.ts'])
run(['scripts/build-free.mjs', '--fixture'])
run(['--import', 'tsx', '--conditions=react-server', 'tests/e2e/prepare-reader.ts'])
const config = JSON.parse(await readFile('dist/free/wrangler.json', 'utf8'))
if (config.name !== 'smp-fixture-preview' || config.vars.SMP_FIXTURE !== '1') throw Error('Refusing a non-fixture server')
const wrangler = 'node_modules/wrangler/bin/wrangler.js'
const local = ['--config', 'dist/free/wrangler.json', '--local', '--persist-to', '.wrangler/browser-qa']
run([wrangler, 'd1', 'migrations', 'apply', 'CMS_DB', ...local])
run([wrangler, 'd1', 'execute', 'CMS_DB', ...local, '--file', '.smp-cache/fixture-seed.sql'])
const child = spawn(process.execPath, [wrangler, 'dev', ...local, '--ip', '127.0.0.1', '--port', '3005'], { stdio: 'inherit', env })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code ?? 0 })
