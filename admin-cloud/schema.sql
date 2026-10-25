PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('staging','ready')),
  owner TEXT NOT NULL,
  pdf_bytes INTEGER NOT NULL CHECK(pdf_bytes BETWEEN 8 AND 33554432),
  cover_bytes INTEGER NOT NULL CHECK(cover_bytes BETWEEN 12 AND 1048576),
  revision INTEGER NOT NULL DEFAULT 1,
  expires INTEGER,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pdf','cover')),
  part INTEGER NOT NULL CHECK(part>=0 AND part<128),
  bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=262144),
  hash TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(object_id,kind,part)
);
CREATE TABLE IF NOT EXISTS usage (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_expiry ON usage(expires);
