import type { Database } from "../../cloudflare/bindings"

export async function ensureAdminSchema(db: Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS free_admin_config (name TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS free_admin_status (id TEXT PRIMARY KEY, page_id TEXT NOT NULL, fingerprint TEXT NOT NULL)"),
  ])
}

export async function adminConfig(db: Database, name: string) {
  return (await db.prepare("SELECT value FROM free_admin_config WHERE name=?").bind(name).first<{ value: string }>())?.value
}

export async function setAdminConfig(db: Database, name: string, value: string) {
  await db.prepare("INSERT INTO free_admin_config(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value WHERE value<>excluded.value").bind(name,value).run()
}
