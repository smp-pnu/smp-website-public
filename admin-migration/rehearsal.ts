import type { DatabaseSync } from "node:sqlite"
import { sha, type MigrationPlan } from "./plan"

// Local review schema. Never imported by a Worker or a deployment script.
export const rehearsalSchema = `
CREATE TABLE IF NOT EXISTS migration_records(
  source_key TEXT PRIMARY KEY,
  legacy_public_id TEXT NOT NULL UNIQUE CHECK(length(legacy_public_id)=32),
  kind TEXT NOT NULL CHECK(kind IN ('research','notice','members')),
  source_revision TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state='review-only'),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migration_asset_refs(
  source_key TEXT NOT NULL REFERENCES migration_records(source_key) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  role TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(source_key,asset_key,role)
);
CREATE TABLE IF NOT EXISTS migration_runs(id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, summary TEXT NOT NULL);
`

export function stagePlan(db: DatabaseSync, plan: MigrationPlan) {
  if (plan.cutoverAllowed !== false || plan.mode !== "offline-read-only") {
    throw Error("Only review-only plans may be rehearsed")
  }
  db.exec("PRAGMA foreign_keys=ON")
  db.exec(rehearsalSchema)
  db.exec("BEGIN IMMEDIATE")
  let inserted = 0, updated = 0, unchanged = 0, olderSkipped = 0
  try {
    for (const row of plan.records) {
      const { snapshotHash, ...payload } = row
      if (row.state !== "review-only" || !Number.isFinite(Date.parse(row.sourceRevision)) || snapshotHash !== sha(payload)) {
        throw Error("Invalid or modified staged record")
      }
      const previous = db.prepare("SELECT source_revision,snapshot_hash FROM migration_records WHERE source_key=?")
        .get(row.sourceKey) as { source_revision: string; snapshot_hash: string } | undefined
      if (previous && Date.parse(previous.source_revision) > Date.parse(row.sourceRevision)) {
        olderSkipped++
        continue
      }
      if (previous?.snapshot_hash === row.snapshotHash) {
        unchanged++
        continue
      }
      db.prepare(`INSERT INTO migration_records(source_key,legacy_public_id,kind,source_revision,source_hash,snapshot_hash,state,payload)
        VALUES(?,?,?,?,?,?,'review-only',?)
        ON CONFLICT(source_key) DO UPDATE SET source_revision=excluded.source_revision,source_hash=excluded.source_hash,
          snapshot_hash=excluded.snapshot_hash,payload=excluded.payload`)
        .run(row.sourceKey, row.legacyPublicId, row.kind, row.sourceRevision, row.sourceHash, row.snapshotHash, JSON.stringify(row))
      db.prepare("DELETE FROM migration_asset_refs WHERE source_key=?").run(row.sourceKey)
      for (const asset of row.assets) {
        db.prepare("INSERT OR IGNORE INTO migration_asset_refs(source_key,asset_key,provider,role,payload) VALUES(?,?,?,?,?)")
          .run(row.sourceKey, asset.key, asset.provider, asset.role, JSON.stringify(asset))
      }
      previous ? updated++ : inserted++
    }
    db.prepare("INSERT OR IGNORE INTO migration_runs(id,captured_at,summary) VALUES(?,?,?)")
      .run(plan.capturedAt, plan.capturedAt, JSON.stringify(plan.stats))
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  // Missing rows never imply deletion. A partial export cannot remove content.
  const total = Number(db.prepare("SELECT count(*) AS n FROM migration_records").get()!.n)
  return { inserted, updated, unchanged, olderSkipped, total }
}
