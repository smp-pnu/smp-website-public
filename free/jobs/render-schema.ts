import type { Database } from "../../cloudflare/bindings"
import { readFile } from "node:fs/promises"

export async function ensureRenderVersions(db: Database) {
  const installed = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name IN ('free_render_versions','free_render_insert','free_render_delete','free_render_update')").first<{count:number}>()
  if (installed?.count === 4) return
  const source = await readFile(new URL("../../cloudflare/migrations/0010_render_versions.sql", import.meta.url), "utf8")
  await db.batch(source.split("-- statement").slice(1).map(sql => db.prepare(sql)))
}
