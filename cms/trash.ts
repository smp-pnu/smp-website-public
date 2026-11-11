import type { Database } from "../cloudflare/bindings"
import { HttpError, object } from "../admin-server/validation"
import { guardedBatch } from "../admin-cloud/transaction"
import type { Env } from "../admin-cloud/worker"
import type { ObjectRow } from "../admin-cloud/store"
import {queueRetirement,uploadReferenced} from './pdf-sources'

export type TrashItem = { id: string; kind: string; title: string; revision: number; trashedAt: string }
export async function trashPreview(db: Database) {
  const count = await db.prepare("SELECT count(*) AS n FROM cms_entries WHERE trashed_at IS NOT NULL").first<{n:number}>()
  const {results} = await db.prepare(`SELECT id,kind,revision,trashed_at AS trashedAt,
    coalesce(json_extract(draft,'$.item.title'),json_extract(draft,'$.item.name'),'제목 없음') AS title
    FROM cms_entries WHERE trashed_at IS NOT NULL ORDER BY trashed_at,id LIMIT 100`).all<TrashItem>()
  return { total: count?.n ?? 0, items: results }
}

// The revision/Trash check and all CMS deletions commit together. A restored or
// edited entry must never lose its history or attachments through a stale view.
export async function purgeCmsEntry(db: Database, id: string, revision: number) {
  await guardedBatch(db, `EXISTS(SELECT 1 FROM cms_entries WHERE id=? AND revision=?
    AND trashed_at IS NOT NULL AND approved IS NULL AND approved_revision IS NULL)
    AND NOT EXISTS(SELECT 1 FROM free_content WHERE id=?)`, [id,revision,id], [
    db.prepare("DELETE FROM cms_jobs WHERE id=?").bind(id),
    db.prepare("DELETE FROM cms_job_sources WHERE id=?").bind(id),
    db.prepare("DELETE FROM cms_export_grants WHERE id=?").bind(id),
    // Assets can be reused by another notice. Keep any such references.
    db.prepare(`DELETE FROM cms_assets WHERE owner=?
      AND NOT EXISTS(SELECT 1 FROM cms_entries e WHERE e.id<>? AND (instr(e.draft,cms_assets.id)>0 OR instr(coalesce(e.approved,''),cms_assets.id)>0))
      AND NOT EXISTS(SELECT 1 FROM cms_history h WHERE h.id<>? AND instr(h.payload,cms_assets.id)>0)
      AND NOT EXISTS(SELECT 1 FROM free_content f WHERE instr(f.item,cms_assets.id)>0 OR instr(f.blocks,cms_assets.id)>0)`)
      .bind(id,id,id),
    db.prepare("DELETE FROM cms_history WHERE id=?").bind(id),
    db.prepare("DELETE FROM cms_entries WHERE id=?").bind(id),
  ])
}

export async function retireUpload(env: Env, upload: string, now: number) {
  if (!/^[a-f\d]{32}$/.test(upload)) return false
  const db=env.CMS_DB!
  // Both current and previous approved revisions may still need the original.
  if(await uploadReferenced(db,upload,env.ADMIN_DB)) return false
  const row=await env.ADMIN_DB.prepare("SELECT * FROM objects WHERE replace(id,'-','')=? AND status='ready'").bind(upload).first<ObjectRow>()
  if(!row) return true
  const data=JSON.parse(row.data)
  if(data.trashedAt) return true
  // Keep original bytes for the normal 30-day quarantine. No Drive deletion is
  // performed in this request; existing reference/ownership checks still apply.
  await guardedBatch(env.ADMIN_DB,"EXISTS(SELECT 1 FROM objects WHERE id=? AND revision=?)",[row.id,row.revision],[
    env.ADMIN_DB.prepare("UPDATE objects SET data=?,revision=revision+1 WHERE id=?").bind(JSON.stringify({...data,revision:row.revision+1,trashedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()}),row.id),
    env.ADMIN_DB.prepare("DELETE FROM report_releases WHERE report_id=?").bind(row.id),
    env.ADMIN_DB.prepare("DELETE FROM report_jobs WHERE report_id=?").bind(row.id),
  ])
  return true
}

export async function emptyTrashItem(env: Env, input: unknown, now: number) {
  if(!env.CMS_DB) throw new HttpError(409,"게시 관리 연결을 확인해 주세요.")
  const value=object(input),id=value.id,revision=value.revision
  if(value.confirm!=="permanent-delete"||typeof id!=="string"||!/^[a-f\d]{32}$/.test(id)||!Number.isSafeInteger(revision)||Number(revision)<1)
    throw new HttpError(400,"삭제할 자료를 다시 확인해 주세요.")
  const row=await env.CMS_DB.prepare("SELECT id FROM cms_entries WHERE id=?").bind(id).first()
  if(!row) return {removed:false,alreadyRemoved:true,cleanupPending:false}
  const uploads=await env.CMS_DB.prepare(`SELECT json_extract(draft,'$.upload.id') upload FROM cms_entries WHERE id=?
    UNION SELECT json_extract(approved,'$.upload.id') FROM cms_entries WHERE id=?
    UNION SELECT json_extract(payload,'$.upload.id') FROM cms_history WHERE id=?
    UNION SELECT json_extract(payload,'$.upload.id') FROM cms_jobs WHERE id=?`).bind(id,id,id,id).all<{upload:string|null}>()
  // Queue before purging so a crash cannot leave the old sources forgotten.
  const ids=uploads.results.map(r=>r.upload).filter((v):v is string=>!!v&&/^[a-f\d]{32}$/.test(v))
  if(ids.length)await env.CMS_DB.batch(ids.map(upload=>queueRetirement(env.CMS_DB!,upload,now)))
  await purgeCmsEntry(env.CMS_DB,id,Number(revision))
  let cleanupPending=false
  for(const upload of ids){try{await retireUpload(env,upload,now)}catch{cleanupPending=true}}
  await env.ADMIN_DB.prepare("DELETE FROM dashboard_snapshots WHERE key='overview'").run()
  return {removed:true,cleanupPending}
}
