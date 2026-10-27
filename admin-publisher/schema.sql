-- Local preview only. Never installed by production or admin deploy scripts.
CREATE TABLE IF NOT EXISTS preview_config (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO preview_config VALUES('mode','admin-report-local-preview-v1');
CREATE TABLE IF NOT EXISTS preview_reports (
  id TEXT PRIMARY KEY, approved TEXT NOT NULL, edition TEXT NOT NULL,
  item TEXT NOT NULL, cover TEXT NOT NULL, original TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preview_attempts (
  edition TEXT PRIMARY KEY, attempts INTEGER NOT NULL,next_at INTEGER NOT NULL,error TEXT
);
CREATE TABLE IF NOT EXISTS preview_controls (key TEXT PRIMARY KEY,value INTEGER NOT NULL,token TEXT);
CREATE TABLE IF NOT EXISTS mutation_checks(token TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
