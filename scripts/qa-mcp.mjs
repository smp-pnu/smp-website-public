// Dedicated stateless browser, never the user's Chrome profile or live CMS.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from '@playwright/test'
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js')
const child = spawn(process.execPath, [cli,
  '--headless', '--isolated', '--sandbox', '--block-service-workers', '--no-webmcp',
  '--executable-path', chromium.executablePath(),
  '--allowed-origins', 'http://127.0.0.1:3005;https://localhost:3019',
  '--ignore-https-errors', '--init-page', path.join(root, 'tests/e2e/mcp-guard.ts'),
  '--output-dir', path.join(root, '.smp-cache/browser-qa-mcp'),
  '--output-max-size', '25000000', '--timeout-action', '15000',
], { cwd: root, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code ?? 0 })
