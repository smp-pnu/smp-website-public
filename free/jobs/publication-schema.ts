import type { Database } from "../../cloudflare/bindings"
import { readFile } from "node:fs/promises"
export async function ensurePublicationChecks(db:Database) {
  if(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='free_publication_checks'").first()) return
  await db.prepare(await readFile(new URL("../../cloudflare/migrations/0008_publication_checks.sql",import.meta.url),"utf8")).run()
}
