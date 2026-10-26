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

-- Immutable report files/versions. The public CMS is not connected to these tables.
CREATE TABLE IF NOT EXISTS report_files (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('d1','drive')),
  identity TEXT NOT NULL,
  identity_algorithm TEXT NOT NULL DEFAULT 'smp-pdf-chunks-v1',
  pdf_bytes INTEGER NOT NULL,
  cover_bytes INTEGER NOT NULL,
  file_id TEXT,
  folder_id TEXT,
  source_sha256 TEXT,
  managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0,1)),
  state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','pending-delete','deleted')),
  created INTEGER NOT NULL,
  delete_after INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS report_file_bindings (
  report_id TEXT PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES report_files(id)
);
CREATE TABLE IF NOT EXISTS report_versions (
  report_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  asset_id TEXT NOT NULL REFERENCES report_files(id),
  data TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(report_id,revision)
);
CREATE INDEX IF NOT EXISTS report_versions_asset ON report_versions(asset_id);
CREATE TABLE IF NOT EXISTS report_releases (
  report_id TEXT PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  owner TEXT NOT NULL DEFAULT 'admin-trial' CHECK(owner='admin-trial'),
  approved_revision INTEGER NOT NULL,
  approved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS report_jobs (
  report_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('waiting','cancelled')),
  created INTEGER NOT NULL,
  PRIMARY KEY(report_id,revision)
);
CREATE TABLE IF NOT EXISTS archived_report_chunks (
  asset_id TEXT NOT NULL REFERENCES report_files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pdf','cover')),
  part INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  hash TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(asset_id,kind,part)
);
CREATE TABLE IF NOT EXISTS report_storage (
  object_id TEXT PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('d1','drive'))
);
CREATE TABLE IF NOT EXISTS drive_uploads (
  object_id TEXT PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  session_secret TEXT,
  offset INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  source_sha256 TEXT,
  expected_sha256 TEXT,
  lease TEXT,
  lease_expires INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS drive_upload_parts (
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY(object_id,part)
);
CREATE TABLE IF NOT EXISTS storage_secrets(key TEXT PRIMARY KEY, encrypted TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drive_oauth (
  state_hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  verifier_secret TEXT NOT NULL,
  pending_secret TEXT,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS abandoned_drive_files (
  file_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  delete_after INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
