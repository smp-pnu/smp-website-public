-- Temporary encrypted enrollment candidates, never active authentication keys.
CREATE TABLE IF NOT EXISTS free_webhook_setup (
  id TEXT PRIMARY KEY, sealed_token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
