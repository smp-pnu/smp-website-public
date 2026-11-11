import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

export function validateReportShareFiles(files) {
  if (!Array.isArray(files) || files.length > 1000) throw Error('Invalid sharing image manifest')
  for (const file of files) {
    if (typeof file !== 'string' || !/^[a-f0-9]{32}\/v2-[a-f0-9]{64}-[a-f0-9]{16}\.jpg$/.test(file)) {
      throw Error('Invalid sharing image path')
    }
  }
  return files
}

// Only generated share images are disposable. Do not traverse symlinks or
// touch PDF sources, covers, manifests, or unrelated files in a reused cache.
export async function pruneReportShareFiles(root, files) {
  const keep = new Set(validateReportShareFiles(files))
  let directories
  try { directories = await readdir(root, { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const dir of directories) {
    if (!dir.isDirectory() || !/^[a-f0-9]{32}$/.test(dir.name)) continue
    const folder = path.join(root, dir.name)
    for (const file of await readdir(folder, { withFileTypes: true })) {
      if (!file.isFile() || !/^(?:v2-[a-f0-9]{64}-[a-f0-9]{16}\.jpg|v1-[a-f0-9]{64}\.png)$/.test(file.name)) continue
      if (!keep.has(`${dir.name}/${file.name}`)) await rm(path.join(folder, file.name))
    }
    if (!(await readdir(folder)).length) await rm(folder, { recursive: true })
  }
}
