import { spend } from "../server/budget"
import type { Env } from "../server/types"

// Upgrade the existing library gradually, leaving at least 30 of the existing
// 50 daily preparation slots for ordinary publishing and manual refreshes.
export async function queueReaderBackfill(env:Env) {
  if(await env.CMS_DB.prepare("SELECT id FROM free_jobs WHERE attempts<5 LIMIT 1").first())return
  const rows=await env.CMS_DB.prepare(`SELECT id,revision FROM free_content
    WHERE kind='research' AND NOT EXISTS (SELECT 1 FROM free_jobs WHERE free_jobs.id=free_content.id) AND cover IS NOT NULL
    AND (json_extract(cover,'$.reader.version') IS NULL OR (json_extract(cover,'$.reader.pagePackVersion') IS NULL AND id IN (
      SELECT id FROM free_content WHERE kind='research' ORDER BY json_extract(item,'$.date') DESC,id LIMIT 32)))
    ORDER BY json_extract(item,'$.date') DESC,id LIMIT 4`).all<{id:string;revision:string}>()
  for(const row of rows.results) {
    try {await spend(env.CMS_DB,"reader-backfill-day",20,86_400_000)} catch {break}
    await env.CMS_DB.prepare("INSERT INTO free_jobs(id,revision,next_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").bind(row.id,row.revision,Date.now()).run()
  }
}
