import type { Env } from '../admin-cloud/worker'
import { HttpError } from '../admin-server/validation'
import { uploadsReferenced } from './pdf-sources'
import { emptyTrashItem, retireUpload } from './trash'

export async function guardUploadDeletion(env: Env, ids: string[]) {
  if (!env.CMS_DB) return
  if (await uploadsReferenced(env.CMS_DB,ids,env.ADMIN_DB))
    throw new HttpError(409,'게시글·수정 이력에서 사용하는 PDF입니다. 원본은 참조가 모두 없어지고 보관 기간이 지난 뒤 자동 정리합니다.')
}

export async function cmsMaintenance(env: Env, now: number) {
  if (!env.CMS_DB) return
  const db=env.CMS_DB
  const lease=await db.prepare(`INSERT INTO free_controls(name,until_at) VALUES('cms-housekeeping',?)
    ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<=? RETURNING name`).bind(now+3600000,now).first()
  if(!lease)return
  const cutoff=new Date(now-30*86400000).toISOString()
  const rows=await db.prepare(`SELECT id,revision FROM cms_entries WHERE trashed_at<? AND approved IS NULL LIMIT 2`).bind(cutoff).all<{id:string;revision:number}>()
  for(const row of rows.results) {
    try { await emptyTrashItem(env,{...row,confirm:'permanent-delete'},now) }
    catch(e) { if(!(e instanceof HttpError && e.status===409))throw e }
  }
  // Only files explicitly displaced by a replacement/deletion are candidates.
  // Never sweep unrelated upload drafts. Backoff prevents retained history from
  // starving the queue and avoids work on every visitor request.
  const candidates=await db.prepare('SELECT upload_id FROM cms_upload_retirements WHERE next_at<=? ORDER BY next_at,upload_id LIMIT 2').bind(now).all<{upload_id:string}>()
  for(const {upload_id:id} of candidates.results) {
    if(await retireUpload(env,id,now))await db.prepare('DELETE FROM cms_upload_retirements WHERE upload_id=?').bind(id).run()
    else await db.prepare('UPDATE cms_upload_retirements SET next_at=? WHERE upload_id=?').bind(now+86400000,id).run()
  }
  await db.batch([
    db.prepare('DELETE FROM cms_export_grants WHERE expires_at<?').bind(now),
    db.prepare('DELETE FROM cms_job_sources WHERE expires_at<?').bind(now),
    db.prepare(`DELETE FROM cms_assets WHERE id IN(SELECT a.id FROM cms_assets a JOIN cms_entries e ON e.id=a.owner WHERE a.created_at<? AND instr(e.draft,a.id)=0 AND (e.approved IS NULL OR instr(e.approved,a.id)=0) AND NOT EXISTS(SELECT 1 FROM cms_history h WHERE h.id=e.id AND instr(h.payload,a.id)>0) LIMIT 10)`).bind(cutoff),
  ])
}
