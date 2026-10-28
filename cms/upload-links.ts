import type { Database } from '../cloudflare/bindings'
import type { UploadLink } from '../admin-lab/upload-workflow'
import { cmsLimits } from './model'
import { HttpError } from '../admin-server/validation'
// Bounded metadata only; do not fetch PDFs, Drive credentials or entire CMS bodies.
export async function uploadLinks(db: Database): Promise<UploadLink[]> {
  const {results} = await db.prepare(`SELECT id,json_extract(draft,'$.item.title') AS title,
    json_extract(draft,'$.upload.id') AS uploadId,json_extract(draft,'$.item.managedPdf.identity') AS identity,
    trashed_at AS trashedAt FROM cms_entries WHERE kind='research'
    AND (json_extract(draft,'$.upload.id') IS NOT NULL OR json_extract(draft,'$.item.managedPdf.identity') IS NOT NULL) LIMIT ?`).bind(cmsLimits.entries+1).all<UploadLink>()
  if(results.length>cmsLimits.entries)throw new HttpError(409,'리포트 자료 수를 확인해 주세요.')
  return results
}
