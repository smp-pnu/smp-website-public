import type { Database } from "../../cloudflare/bindings"
import { normalizeId } from "../../lib/content-model"

export type MaintenanceOperation="publish"|"status"|"prepare-library"|"retry-failed"|"refresh-report"
export function maintenanceInput(operation:string,rawId="") {
  if(!["publish","status","prepare-library","retry-failed","refresh-report"].includes(operation)) throw new Error("Unknown maintenance operation")
  const id=rawId?normalizeId(rawId.trim()):null
  if((operation==="retry-failed" || operation==="refresh-report") && !id) throw new Error("A Notion page ID is required (32 characters, or UUID)")
  if((operation==="publish" || operation==="status" || operation==="prepare-library") && rawId.trim()) throw new Error("This operation does not accept a page ID")
  return {operation:operation as MaintenanceOperation,id}
}
export async function managePublication(db:Database,operation:MaintenanceOperation,id:string|null,now=Date.now()) {
  if(operation==="publish" || operation==="status" || operation==="prepare-library") return false
  if(!id || normalizeId(id)!==id) throw new Error("Invalid page ID")
  if(await db.prepare("SELECT name FROM free_controls WHERE name='publisher' AND until_at>?").bind(now).first()) throw new Error("Publisher is active; wait for the current run to finish")
  const row=operation==="retry-failed"
    ?await db.prepare(`UPDATE free_jobs SET attempts=0,next_at=?,lease_token=NULL,lease_until=0
      WHERE id=? AND attempts>=5 AND lease_until<=? AND EXISTS(SELECT 1 FROM free_content WHERE id=free_jobs.id) RETURNING id`).bind(now,id,now).first()
    :await db.prepare(`INSERT INTO free_jobs(id,revision,next_at)
      SELECT id,revision,? FROM free_content WHERE id=? AND kind='research'
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,attempts=0,next_at=excluded.next_at,lease_token=NULL,lease_until=0
      WHERE free_jobs.lease_until<=? RETURNING id`).bind(now,id,now).first()
  if(!row) throw new Error(operation==="retry-failed"?"No stopped, unlocked publication found for this page":"No published, unlocked report found for this page")
  return true
}
export async function publicationStatus(db:Database,now=Date.now()) {
  const [sync,queue,failed,budget]=await Promise.all([
    db.prepare("SELECT s.kind,s.checked_at,r.outcome,r.next_at FROM free_sync s LEFT JOIN free_sync_runs r ON r.kind=s.kind ORDER BY s.kind").all(),
    db.prepare("SELECT COUNT(*) AS pending,COALESCE(SUM(attempts>=5),0) AS stopped,COALESCE(SUM(lease_until>?),0) AS active FROM free_jobs").bind(now).first(),
    db.prepare("SELECT id,attempts,last_error,failed_at,next_at FROM free_jobs WHERE last_error IS NOT NULL OR attempts>=5 ORDER BY failed_at DESC LIMIT 20").all(),
    db.prepare("SELECT key,count,expires_at FROM free_budget WHERE expires_at>? AND (key LIKE 'notion-%day:%' OR key LIKE 'prepare-day:%' OR key LIKE 'reader-library-day:%' OR key LIKE 'publish-dispatch-day:%') ORDER BY key").bind(now).all(),
  ])
  return {observedAt:new Date(now).toISOString(),sync:sync.results,queue,failed:failed.results,budget:budget.results}
}
