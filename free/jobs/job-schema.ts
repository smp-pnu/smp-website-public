import type { Database } from "../../cloudflare/bindings"
export async function ensureJobFailures(db:Database) {
  const {results}=await db.prepare("PRAGMA table_info(free_jobs)").all<{name:string}>()
  const names=new Set(results.map(row=>row.name))
  // Individual checks also recover an interrupted two-column migration.
  if(!names.has("last_error")) await db.prepare("ALTER TABLE free_jobs ADD COLUMN last_error TEXT").run()
  if(!names.has("failed_at")) await db.prepare("ALTER TABLE free_jobs ADD COLUMN failed_at INTEGER").run()
}
