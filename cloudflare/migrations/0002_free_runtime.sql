CREATE TABLE IF NOT EXISTS free_content (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision TEXT NOT NULL,
  item TEXT NOT NULL, search_entry TEXT NOT NULL, blocks TEXT,
  body_revision TEXT, cover TEXT
);
CREATE INDEX IF NOT EXISTS free_content_kind ON free_content(kind);
CREATE TABLE IF NOT EXISTS free_sync (
  kind TEXT PRIMARY KEY, checked_at INTEGER NOT NULL DEFAULT 0,
  watermark TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', cursor TEXT, started_at INTEGER
);
CREATE TABLE IF NOT EXISTS free_documents (name TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS free_budget (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS free_jobs (
  id TEXT PRIMARY KEY, revision TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS free_jobs_ready ON free_jobs(next_at, lease_until);
CREATE TABLE IF NOT EXISTS free_events (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS free_media (page_id TEXT NOT NULL, block_id TEXT NOT NULL, PRIMARY KEY(page_id, block_id));
INSERT OR IGNORE INTO free_sync(kind) VALUES ('research'), ('notice'), ('members');
