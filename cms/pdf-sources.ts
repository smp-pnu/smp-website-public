import type { Database } from '../cloudflare/bindings'
import type { ContentItem } from '../lib/content-model'
import type { Payload } from './model'

export function driveSourceId(value: string | null | undefined) {
  if (!value) return null
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.hostname !== 'drive.google.com') return null
    const id = u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id')
    return id && /^[\w-]{10,200}$/.test(id) ? id : null
  } catch { return null }
}

// The archived payload stays byte-for-byte unchanged. Resolve only its PDF
// source when it is read again; titles, dates, authors and revision metadata stay.
export async function resolvePdfSource(db: Database, payload: Payload): Promise<Payload> {
  const id = driveSourceId((payload.item as ContentItem).externalUrl)
  if (!id || payload.upload) return payload
  const row = await db.prepare('SELECT source FROM cms_pdf_aliases WHERE source_id=?').bind(id).first<{source:string}>()
  if (!row) return payload
  const source = JSON.parse(row.source) as Pick<Payload,'upload'|'original'> & {managedPdf:ContentItem['managedPdf']}
  return {...payload, upload:source.upload, original:source.original, cover:null,
    item:{...payload.item, externalUrl:null, managedPdf:source.managedPdf} as ContentItem}
}

// A draft alone is insufficient: the still-live approval, a preparation job or
// a retained revision can refer to a different PDF after an editor replaces it.
export async function uploadReferenced(db: Database, upload: string, admin?: Database) {
  return uploadsReferenced(db,[upload],admin)
}
export async function uploadsReferenced(db: Database, uploads: string[], admin?: Database) {
  const ids=uploads.map(id=>id.replaceAll('-',''))
  if(ids.some(id=>!/^[a-f\d]{32}$/.test(id)))return true
  if(!ids.length)return false
  const identities=admin?(await admin.prepare(`SELECT DISTINCT f.identity FROM report_files f JOIN report_versions v ON v.asset_id=f.id
    WHERE replace(v.report_id,'-','') IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{identity:string}>()).results.map(r=>r.identity):[]
  return !!await db.prepare(`WITH refs AS(SELECT value FROM json_each(?)) SELECT 1 AS found WHERE
    EXISTS(SELECT 1 FROM cms_entries WHERE json_extract(draft,'$.upload.id') IN(SELECT value FROM refs) OR json_extract(approved,'$.upload.id') IN(SELECT value FROM refs))
    OR EXISTS(SELECT 1 FROM cms_history WHERE json_extract(payload,'$.upload.id') IN(SELECT value FROM refs))
    OR EXISTS(SELECT 1 FROM cms_jobs WHERE json_extract(payload,'$.upload.id') IN(SELECT value FROM refs))
    OR EXISTS(SELECT 1 FROM free_content WHERE json_extract(item,'$.managedPdf.identity') IN(SELECT value FROM json_each(?)))
    OR EXISTS(SELECT 1 FROM cms_pdf_aliases a WHERE upload_id IN(SELECT value FROM refs) AND (
      EXISTS(SELECT 1 FROM cms_entries WHERE instr(draft,a.source_id)>0 OR instr(coalesce(approved,''),a.source_id)>0)
      OR EXISTS(SELECT 1 FROM cms_history WHERE instr(payload,a.source_id)>0)
      OR EXISTS(SELECT 1 FROM cms_jobs WHERE instr(payload,a.source_id)>0)
      OR EXISTS(SELECT 1 FROM free_content WHERE instr(item,a.source_id)>0)))`)
    .bind(JSON.stringify(ids),JSON.stringify(identities)).first()
}

export function queueRetirement(db: Database, upload: string, now: number) {
  return db.prepare('INSERT OR IGNORE INTO cms_upload_retirements(upload_id,next_at) VALUES(?,?)').bind(upload,now)
}
