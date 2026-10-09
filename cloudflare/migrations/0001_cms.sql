CREATE TABLE content_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  tags TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX content_cache_expiry ON content_cache(expires_at);
CREATE TABLE content_jobs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  available_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX content_jobs_ready ON content_jobs(available_at, lease_until);
