-- Short-lived publication checks shared by detail/PDF requests. Never public data.
CREATE TABLE IF NOT EXISTS free_publication_checks (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL,
  revision TEXT NOT NULL, item TEXT NOT NULL, checked_at INTEGER NOT NULL
);
