import type {Database} from "../cloudflare/bindings"
import {emptyCloudUsage,type CloudUsage} from "../admin-lab/cloudflare-model"

// A single private snapshot, not event history. No Cloudflare token is deployed
// to the admin Worker; the existing trusted publisher writes these aggregates.
export const CLOUD_USAGE_SCHEMA = `CREATE TABLE IF NOT EXISTS cms_cloud_usage (
 id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT CHECK(payload IS NULL OR (json_valid(payload) AND length(payload)<=131072)),
 refresh_after INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0
)`
export async function readCloudUsage(db:Database):Promise<CloudUsage> {
  const row=await db.prepare("SELECT payload FROM cms_cloud_usage WHERE id=1").first<{payload:string|null}>()
  return row?.payload ? JSON.parse(row.payload) as CloudUsage : emptyCloudUsage()
}
