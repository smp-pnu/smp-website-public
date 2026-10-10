import {readFile} from 'node:fs/promises'
import type {Database} from '../../cloudflare/bindings'

// Run before the first deployment that uses the new table. Subsequent
// publishing runs read one schema row rather than rescanning the catalogue.
export async function ensureReportCoverCache(db:Database) {
  if(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='free_report_covers'").first()) return
  const sql=await readFile(new URL('../../cloudflare/migrations/0006_report_cover_cache.sql',import.meta.url),'utf8')
  await db.batch(sql.split(';').map(part=>part.trim()).filter(Boolean).map(part=>db.prepare(part)))
}
