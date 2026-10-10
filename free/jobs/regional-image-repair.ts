import type { Database } from "../../cloudflare/bindings"

const marker="repair:notion-apne2-images-v1"
const host="https://prod-files-secure-apne2.s3.ap-northeast-2.amazonaws.com/"

// Run under the publisher lock. Reprepare existing affected bodies once;
// retain their text and preserve any active job's lease/attempt limit.
export async function repairRegionalImages(db:Database) {
  if(await db.prepare("SELECT name FROM free_controls WHERE name=?").bind(marker).first()) return
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO free_jobs(id,revision,next_at)
      SELECT id,revision,0 FROM free_content WHERE instr(blocks,?)>0`).bind(host),
    db.prepare("INSERT OR IGNORE INTO free_controls(name,until_at) VALUES (?,0)").bind(marker),
  ])
}
