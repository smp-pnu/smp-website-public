import { mkdir, readdir, link } from 'node:fs/promises'
import path from 'node:path'

// The cache and deployment live on the same runner filesystem. Link immutable,
// hash-named assets instead of making a second multi-GiB copy before upload.
// Both directories may be removed independently; never modify a linked file.
export async function stageReaderAssets(source, destination, fixture = false) {
  let reports
  try { reports = await readdir(source, { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const report of reports) {
    if (report.isSymbolicLink()) throw new Error('Reader asset links are not allowed')
    if (!report.isDirectory() || !/^[a-f0-9]{32}$/.test(report.name)) continue
    if (fixture && report.name !== 'a0000000000000000000000000000001') continue
    const from = path.join(source, report.name), to = path.join(destination, report.name)
    await mkdir(to, { recursive: true })
    for (const file of await readdir(from, { withFileTypes: true })) {
      if (file.isSymbolicLink()) throw new Error('Reader asset links are not allowed')
      if (!file.isFile() || !/^[a-f0-9]{64}(\.pack|\.pdf|\.\d{4}\.bin)$/.test(file.name)) continue
      await link(path.join(from, file.name), path.join(to, file.name))
    }
  }
}
