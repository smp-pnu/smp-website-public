-- Authoring data is separate from the public read model and authentication DB.
CREATE TABLE IF NOT EXISTS cms_entries (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('research','notice','members')),
 draft TEXT NOT NULL CHECK(json_valid(draft)), revision INTEGER NOT NULL DEFAULT 1,
 approved TEXT CHECK(approved IS NULL OR json_valid(approved)), approved_revision INTEGER,
 updated_at TEXT NOT NULL, trashed_at TEXT, source TEXT NOT NULL DEFAULT 'admin',
 rank REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cms_entries_kind ON cms_entries(kind,trashed_at,rank);
CREATE TABLE IF NOT EXISTS cms_history (
 id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL,
 PRIMARY KEY(id,revision)
);
CREATE TABLE IF NOT EXISTS cms_jobs (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL,
 next_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE TABLE IF NOT EXISTS cms_assets (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL,
 bytes INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cms_assets_owner ON cms_assets(owner);
CREATE TABLE IF NOT EXISTS cms_export_grants (
 token_hash TEXT PRIMARY KEY, id TEXT NOT NULL, revision INTEGER NOT NULL,
 source_id TEXT NOT NULL, source_revision INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 hits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cms_job_sources (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_cloud_usage (
 id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT CHECK(payload IS NULL OR (json_valid(payload) AND length(payload)<=131072)),
 refresh_after INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cms_site_receipts (
 id TEXT PRIMARY KEY, day TEXT NOT NULL, budget_day TEXT NOT NULL, report TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('download','start','ready','failed')),
 bucket INTEGER NOT NULL, ms INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cms_site_receipts_expiry ON cms_site_receipts(expires_at);
CREATE TABLE IF NOT EXISTS cms_site_days (day TEXT PRIMARY KEY, events INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cms_site_counts (
 day TEXT NOT NULL, report TEXT NOT NULL, kind TEXT NOT NULL, bucket INTEGER NOT NULL,
 count INTEGER NOT NULL, total_ms INTEGER NOT NULL, PRIMARY KEY(day,report,kind,bucket)
);
CREATE TABLE IF NOT EXISTS cms_site_snapshot (
 id INTEGER PRIMARY KEY CHECK(id=1), started_at INTEGER NOT NULL,
 payload TEXT CHECK(payload IS NULL OR (json_valid(payload) AND length(payload)<=262144)),
 refresh_after INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0
);

-- Atomic guard for explicit Trash deletion with revision checks.
CREATE TABLE IF NOT EXISTS mutation_checks(token TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
