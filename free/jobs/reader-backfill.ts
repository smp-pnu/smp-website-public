import { spend } from "../server/budget"
import type { Env } from "../server/types"

// Routine maintenance stays at 20/day and yields to ordinary publications.
// The explicitly dispatched library migration is finite (200 existing reports)
// and uses a separate daily conversion budget, never visitor Workers CPU.
export async function queueReaderBackfill(env:Env, libraryMigration=false) {
  if(!libraryMigration && await env.CMS_DB.prepare("SELECT id FROM free_jobs WHERE attempts<5 LIMIT 1").first())return
  const rows=await env.CMS_DB.prepare(`SELECT id,revision FROM free_content
    WHERE kind='research' AND NOT EXISTS (SELECT 1 FROM free_jobs WHERE free_jobs.id=free_content.id) AND cover IS NOT NULL
    AND json_extract(cover,'$.reader.pagePack.url') IS NULL
    ORDER BY json_extract(item,'$.date') DESC,id LIMIT ?`).bind(libraryMigration?200:4).all<{id:string;revision:string}>()
  for(const row of rows.results) {
    if(!libraryMigration)try {await spend(env.CMS_DB,"reader-backfill-day",20,86_400_000)} catch {break}
    await env.CMS_DB.prepare("INSERT INTO free_jobs(id,revision,next_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").bind(row.id,row.revision,Date.now()).run()
  }
}
