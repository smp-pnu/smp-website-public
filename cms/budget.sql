CREATE TABLE IF NOT EXISTS cms_metadata_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL);
-- statement
CREATE TRIGGER IF NOT EXISTS cms_entries_count_limit BEFORE INSERT ON cms_entries
WHEN NOT EXISTS(SELECT 1 FROM cms_entries WHERE id=NEW.id) AND (SELECT count(*) FROM cms_entries)>=2500
BEGIN SELECT RAISE(ABORT,'SMP_CMS_ENTRY_LIMIT'); END;
-- statement
INSERT OR IGNORE INTO cms_metadata_budget SELECT 1,
 COALESCE((SELECT sum(length(CAST(draft AS BLOB))+COALESCE(length(CAST(approved AS BLOB)),0)) FROM cms_entries),0)+COALESCE((SELECT sum(length(CAST(payload AS BLOB))) FROM cms_history),0);
-- statement
CREATE TRIGGER IF NOT EXISTS cms_entries_insert_budget BEFORE INSERT ON cms_entries
WHEN NOT EXISTS(SELECT 1 FROM cms_entries WHERE id=NEW.id) AND EXISTS(SELECT 1 FROM cms_metadata_budget WHERE bytes+length(CAST(NEW.draft AS BLOB))+COALESCE(length(CAST(NEW.approved AS BLOB)),0)>67108864)
BEGIN SELECT RAISE(ABORT,'SMP_CMS_METADATA_LIMIT'); END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_entries_update_budget BEFORE UPDATE ON cms_entries
WHEN EXISTS(SELECT 1 FROM cms_metadata_budget WHERE bytes-length(CAST(OLD.draft AS BLOB))-COALESCE(length(CAST(OLD.approved AS BLOB)),0)+length(CAST(NEW.draft AS BLOB))+COALESCE(length(CAST(NEW.approved AS BLOB)),0)>67108864)
BEGIN SELECT RAISE(ABORT,'SMP_CMS_METADATA_LIMIT'); END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_entries_insert_usage AFTER INSERT ON cms_entries
BEGIN UPDATE cms_metadata_budget SET bytes=bytes+length(CAST(NEW.draft AS BLOB))+COALESCE(length(CAST(NEW.approved AS BLOB)),0) WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_entries_update_usage AFTER UPDATE ON cms_entries
BEGIN UPDATE cms_metadata_budget SET bytes=bytes-length(CAST(OLD.draft AS BLOB))-COALESCE(length(CAST(OLD.approved AS BLOB)),0)+length(CAST(NEW.draft AS BLOB))+COALESCE(length(CAST(NEW.approved AS BLOB)),0) WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_entries_delete_usage AFTER DELETE ON cms_entries
BEGIN UPDATE cms_metadata_budget SET bytes=bytes-length(CAST(OLD.draft AS BLOB))-COALESCE(length(CAST(OLD.approved AS BLOB)),0) WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_history_insert_budget BEFORE INSERT ON cms_history
WHEN NOT EXISTS(SELECT 1 FROM cms_history WHERE id=NEW.id AND revision=NEW.revision) AND EXISTS(SELECT 1 FROM cms_metadata_budget WHERE bytes+length(CAST(NEW.payload AS BLOB))>67108864)
BEGIN SELECT RAISE(ABORT,'SMP_CMS_METADATA_LIMIT'); END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_history_insert_usage AFTER INSERT ON cms_history
BEGIN UPDATE cms_metadata_budget SET bytes=bytes+length(CAST(NEW.payload AS BLOB)) WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_history_delete_usage AFTER DELETE ON cms_history
BEGIN UPDATE cms_metadata_budget SET bytes=bytes-length(CAST(OLD.payload AS BLOB)) WHERE id=1; END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_history_immutable BEFORE UPDATE ON cms_history
BEGIN SELECT RAISE(ABORT,'SMP_CMS_HISTORY_IMMUTABLE'); END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_asset_limit BEFORE INSERT ON cms_assets
WHEN (SELECT COALESCE(sum(bytes),0) FROM cms_assets)+NEW.bytes>104857600 OR NEW.bytes>1400000
BEGIN SELECT RAISE(ABORT,'SMP_CMS_ASSET_LIMIT'); END;

-- statement
-- Analytics is optional: stop collecting at the cap without affecting readers.
CREATE TRIGGER IF NOT EXISTS cms_site_budget BEFORE INSERT ON cms_site_receipts
WHEN COALESCE((SELECT events FROM cms_site_days WHERE day=NEW.budget_day),0)>=2000
BEGIN SELECT RAISE(IGNORE); END;
-- statement
CREATE TRIGGER IF NOT EXISTS cms_site_aggregate AFTER INSERT ON cms_site_receipts
BEGIN
 INSERT INTO cms_site_days(day,events) VALUES(NEW.budget_day,1)
 ON CONFLICT(day) DO UPDATE SET events=events+1;
 INSERT INTO cms_site_counts(day,report,kind,bucket,count,total_ms)
 VALUES(NEW.day,NEW.report,NEW.kind,NEW.bucket,1,NEW.ms)
 ON CONFLICT(day,report,kind,bucket) DO UPDATE SET count=count+1,total_ms=total_ms+NEW.ms;
END;
