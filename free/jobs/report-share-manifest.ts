import { createHash } from 'node:crypto'
import type { Database } from '../../cloudflare/bindings'
import { publicCover, type PublicCover } from '../../lib/public-cover'
import { reportSharePath, type ShareText } from '../../lib/report-share-image'
import { adminConfig, setAdminConfig } from './admin-schema'

export type ShareCandidate = ShareText & { id: string; cover: unknown }
const deployedKey = 'report_shares_deployed'

export function selectReportShares(records: ShareCandidate[]) {
  const images = new Map<string, { source: string; item: ShareText }>()
  for (const row of records) {
    const cover = publicCover({ id: row.id, kind: 'research', cover: row.cover as PublicCover })
    if (!cover) continue
    const source = cover.previewUrl ?? cover.url, url = reportSharePath(source, row)
    if (url) images.set(url.slice('/report-shares/'.length), { source, item: row })
  }
  if (images.size > 1000) throw Error('Report sharing image budget exceeded')
  return images
}

function fingerprint(files: string[]) {
  return createHash('sha256').update(JSON.stringify([...new Set(files)].sort())).digest('hex')
}

// One compact projection per existing publisher run, never per visitor.
// Compare desired files with the last successful deployment, not a restored
// runner cache: deletion-only changes must also trigger asset reconciliation.
export async function reportSharesNeedDeployment(db: Database) {
  const { results } = await db.prepare(`SELECT id,
    json_extract(item,'$.title') AS title, json_extract(item,'$.company') AS company,
    json_extract(cover,'$.url') AS url, json_extract(cover,'$.previewUrl') AS previewUrl
    FROM free_content WHERE kind='research' AND cover IS NOT NULL`).all<{
      id: string; title: string; company: string | null; url: string; previewUrl: string | null
    }>()
  const files = [...selectReportShares(results.map(row => ({
    id: row.id, title: row.title, company: row.company ?? '',
    cover: { url: row.url, previewUrl: row.previewUrl ?? undefined },
  }))).keys()]
  return fingerprint(files) !== await adminConfig(db, deployedKey)
}

export async function deployReportShareManifest(db: Database, files: string[], deploy: () => void | Promise<void>) {
  const deployed = fingerprint(files)
  await deploy()
  // Record exactly what was deployed. A deletion or edit during the build
  // remains different from this snapshot and is retried by the next run.
  await setAdminConfig(db, deployedKey, deployed)
}
