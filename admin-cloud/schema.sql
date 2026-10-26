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
CREATE TABLE IF NOT EXISTS admin_sessions (
  hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  subject TEXT NOT NULL,
  expires INTEGER NOT NULL,
  idle_expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_credentials (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  label TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_challenges (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  authority TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_challenge_expiry ON admin_challenges(expires);
CREATE TABLE IF NOT EXISTS metadata_extractions (
  cache_key TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('pending','ready','failed')),
  lease TEXT NOT NULL,
  payload TEXT,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS metadata_extraction_expiry ON metadata_extractions(expires);
