// Isolated browser-only lab. Never loads a production environment or deploys.
import { cp, mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { build, createServer, preview } from 'vite'
const mode = process.argv[2]
if (!['dev', 'build', 'preview'].includes(mode) || process.argv.length !== 3) throw Error('Use dev, build or preview only')
const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const pdfRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
const target = path.join(root, 'dist/admin-lab-assets/pdfjs')
await mkdir(target, { recursive: true })
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(path.join(pdfRoot, folder), path.join(target, folder), { recursive: true })
await cp(path.join(pdfRoot, 'build/pdf.worker.min.mjs'), path.join(target, 'pdf.worker.min.mjs'))
await cp(path.join(pdfRoot, 'LICENSE'), path.join(target, 'LICENSE'))
const configFile = path.join(root, 'admin-lab/vite.config.ts')
if (mode === 'build') await build({ configFile })
else {
  if (mode === 'preview') await readFile(path.join(root, 'dist/admin-lab/index.html'))
  const server = mode === 'dev' ? await createServer({ configFile }) : await preview({ configFile })
  if (mode === 'dev') await server.listen()
  server.printUrls()
  console.log('LOCAL PDF LAB — browser storage only; no Notion, Drive, D1, login or publish connection')
}
