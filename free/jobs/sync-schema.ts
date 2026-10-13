import { readFile } from "node:fs/promises"
import type { Database } from "../../cloudflare/bindings"

// The publisher installs this additive migration before deploying the Workers.
// Keeping it idempotent also supports existing databases and rollback releases.
export async function ensureSyncRuns(db: Database) {
  if (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='free_sync_runs'").first()) return
  const sql = await readFile(new URL("../../cloudflare/migrations/0007_sync_runs.sql", import.meta.url), "utf8")
  await db.prepare(sql).run()
}
