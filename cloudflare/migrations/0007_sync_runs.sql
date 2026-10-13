-- Persistent admission and lease state shared by all scheduled invocations.
CREATE TABLE IF NOT EXISTS free_sync_runs (
  kind TEXT PRIMARY KEY CHECK (kind IN ('research', 'notice', 'members')),
  last_slot INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  completed_at INTEGER
);
