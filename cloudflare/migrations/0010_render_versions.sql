-- A public content change invalidates rendered pages in the same transaction.
-- Catalogue versions alone miss body-only edits and prepared reader changes.
-- statement
CREATE TABLE IF NOT EXISTS free_render_versions (
  kind TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);
-- statement
INSERT OR IGNORE INTO free_render_versions(kind) VALUES ('research'), ('notice');

-- statement
CREATE TRIGGER IF NOT EXISTS free_render_insert AFTER INSERT ON free_content
BEGIN
  UPDATE free_render_versions SET version=version+1 WHERE kind=NEW.kind;
END;
-- statement
CREATE TRIGGER IF NOT EXISTS free_render_delete AFTER DELETE ON free_content
BEGIN
  UPDATE free_render_versions SET version=version+1 WHERE kind=OLD.kind;
END;
-- statement
CREATE TRIGGER IF NOT EXISTS free_render_update
AFTER UPDATE OF kind,revision,item,blocks,body_revision,cover ON free_content
WHEN OLD.kind IS NOT NEW.kind OR OLD.revision IS NOT NEW.revision
  OR OLD.item IS NOT NEW.item OR OLD.blocks IS NOT NEW.blocks
  OR OLD.body_revision IS NOT NEW.body_revision OR OLD.cover IS NOT NEW.cover
BEGIN
  UPDATE free_render_versions SET version=version+1 WHERE kind IN (OLD.kind,NEW.kind);
END;
