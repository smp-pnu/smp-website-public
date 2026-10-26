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
CREATE TABLE IF NOT EXISTS mutation_checks(token TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
CREATE TABLE IF NOT EXISTS library_order(kind TEXT PRIMARY KEY, revision INTEGER NOT NULL, ids TEXT NOT NULL);
INSERT OR IGNORE INTO library_order(kind,revision,ids) VALUES('reports',1,'[]');
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notice_assets (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 12 AND 1048576),
  mime TEXT NOT NULL CHECK(mime IN ('image/webp','image/jpeg')),
  data TEXT NOT NULL,
  expires INTEGER
);
CREATE INDEX IF NOT EXISTS notice_assets_parent ON notice_assets(notice_id);
CREATE TABLE IF NOT EXISTS replacements (
  upload_id TEXT PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS upload_receipts (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  expires INTEGER NOT NULL
);
