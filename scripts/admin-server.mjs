// No env loading, cloud credentials or deployment command. Bind to loopback only.
import path from 'node:path'
import { cp, mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const mode = process.argv[2]
if (!['build', 'start'].includes(mode) || process.argv.length !== 3) throw Error('Use build or start only')
process.umask(0o077)
const root = path.resolve(import.meta.dirname, '..')
if (mode === 'build') {
  const require = createRequire(import.meta.url)
  const pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
  const target = path.join(root, 'dist/admin-lab-assets/pdfjs')
  await mkdir(target, { recursive: true })
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(pdfRoot, folder), path.join(target, folder), { recursive: true })
  for (const name of ['build/pdf.worker.min.mjs', 'LICENSE']) await cp(path.join(pdfRoot, name), path.join(target, path.basename(name)))
  const { build } = await import('vite')
  await build({ configFile: path.join(root, 'admin-server/vite.config.ts'), mode: 'admin-server' })
} else {
  const staticRoot = path.join(root, 'dist/admin-server')
  await readFile(path.join(staticRoot, 'index.html'))
  const { startAdminServer } = await import('../admin-server/http.ts')
  const running = startAdminServer(path.join(root, '.smp-admin-data'), staticRoot)
  let closing = false
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { if (!closing) { closing = true; void running.close().then(() => process.exit(0)) } })
}
