CREATE TABLE IF NOT EXISTS free_report_covers (
  id TEXT PRIMARY KEY, revision TEXT NOT NULL, cover TEXT NOT NULL
);
INSERT OR IGNORE INTO free_report_covers(id,revision,cover)
  SELECT id,revision,cover FROM free_content
  WHERE kind='research' AND cover IS NOT NULL AND json_valid(cover)
    AND json_extract(cover,'$.sourceKey') IS NOT NULL;
