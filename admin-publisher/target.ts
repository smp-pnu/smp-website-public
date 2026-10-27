import type { Database } from "../cloudflare/bindings"

// Only the local rehearsal schema and its explicitly isolated trial copy have
// this marker. The deployment script separately pins the remote trial DB ID.
export async function assertPreviewDatabase(db: Database) {
  const marker = await db.prepare("SELECT value FROM preview_config WHERE key='mode'").first<{ value: string }>()
  if (marker?.value !== "admin-report-local-preview-v1")
    throw Error("Refusing a database outside the isolated local preview")
}
