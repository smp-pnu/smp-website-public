-- Statement boundaries are explicit because triggers contain semicolons.
CREATE TABLE IF NOT EXISTS history_budget (
  id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL, rows INTEGER NOT NULL
);
-- statement
INSERT OR IGNORE INTO history_budget(id,bytes,rows)
  SELECT 1,coalesce(sum(length(CAST(data AS BLOB))),0),count(*) FROM report_versions;
-- statement
CREATE TRIGGER IF NOT EXISTS report_history_limit BEFORE INSERT ON report_versions
WHEN NOT EXISTS(SELECT 1 FROM report_versions WHERE report_id=NEW.report_id AND revision=NEW.revision)
  AND EXISTS(SELECT 1 FROM history_budget WHERE id=1 AND (bytes+length(CAST(NEW.data AS BLOB))>33554432 OR rows>=10000))
BEGIN SELECT RAISE(ABORT,'SMP_HISTORY_LIMIT'); END;
-- statement
CREATE TRIGGER IF NOT EXISTS report_history_insert AFTER INSERT ON report_versions
BEGIN UPDATE history_budget SET bytes=bytes+length(CAST(NEW.data AS BLOB)),rows=rows+1 WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS report_history_delete AFTER DELETE ON report_versions
BEGIN UPDATE history_budget SET bytes=bytes-length(CAST(OLD.data AS BLOB)),rows=rows-1 WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS report_history_immutable BEFORE UPDATE ON report_versions
BEGIN SELECT RAISE(ABORT,'SMP_HISTORY_IMMUTABLE'); END;
