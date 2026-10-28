import type { Database } from "../cloudflare/bindings"
import type { Snapshot } from "../admin-lab/dashboard-model"

type Row = { payload: string | null; checked_at: number | null; refresh_after: number; lease: string }
// Two small rows. A shared lease prevents concurrent tabs from multiplying Drive calls.
// Failures keep the last successful value, explicitly marked stale; never turn them into zero.
export async function dashboardSnapshot<T>(db: Database, key: "overview" | "drive", ttl: number, load: () => Promise<T>, now = Date.now()): Promise<Snapshot<T>> {
  const read = () => db.prepare("SELECT payload,checked_at,refresh_after,lease FROM dashboard_snapshots WHERE key=?").bind(key).first<Row>()
  let row = await read()
  if (!row || row.refresh_after <= now) {
    const lease = crypto.randomUUID()
    const claimed = await db.prepare(`INSERT INTO dashboard_snapshots(key,payload,checked_at,refresh_after,lease) VALUES(?,NULL,NULL,?,?)
      ON CONFLICT(key) DO UPDATE SET refresh_after=excluded.refresh_after,lease=excluded.lease WHERE refresh_after<=? RETURNING key`)
      .bind(key, now + 60_000, lease, now).first()
    if (claimed) {
      try {
        const value = await load()
        await db.prepare("UPDATE dashboard_snapshots SET payload=?,checked_at=?,refresh_after=? WHERE key=? AND lease=?")
          .bind(JSON.stringify(value), now, now + ttl, key, lease).run()
      } catch {
        // The one-minute lease also provides failure backoff. No upstream error/credential is stored.
      }
    }
    row = await read()
  }
  return { value: row?.payload ? JSON.parse(row.payload) as T : null, checkedAt: row?.checked_at ?? null,
    nextCheckAt: row?.refresh_after ?? now + 60_000, stale: !row?.checked_at || row.checked_at + ttl <= now }
}
