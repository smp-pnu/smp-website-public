// Trusted operator entrypoint. No HTTP route calls this function.
import type { Database } from "../cloudflare/bindings";
import type { ContentItem } from "../lib/content-model";
import { memberSearchEntries, type Member } from "../lib/member-model";
import { documentStatements, searchEntry } from "../free/server/catalog";
import { adminMode } from "./mode";
import type { Payload } from "./model";
export async function activateAdmin(db: Database) {
  if (await adminMode(db)) throw Error("Admin CMS is already active");
  const now = Date.now(),
    until = now + 900000;
  if (
    !(await db
      .prepare(
        "INSERT INTO free_controls(name,until_at) VALUES('publisher',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<? RETURNING name",
      )
      .bind(until, now)
      .first())
  )
    throw Error("Wait for the current publisher to finish");
  try {
    const original = (
      await db
        .prepare("SELECT id,revision FROM free_content ORDER BY id")
        .all<{ id: string; revision: string }>()
    ).results;
    const approved = (
      await db
        .prepare(
          "SELECT id,kind,approved,approved_revision,updated_at FROM cms_entries WHERE approved IS NOT NULL AND trashed_at IS NULL ORDER BY id",
        )
        .all<{
          id: string;
          kind: string;
          approved: string;
          approved_revision: number;
          updated_at: string;
        }>()
    ).results;
    if (
      !original.length ||
      JSON.stringify(original.map((r) => r.id)) !==
        JSON.stringify(approved.map((r) => r.id))
    )
      throw Error("Public IDs differ; review the import before switching");
    const rows = approved.map((r) => {
      const p: Payload = JSON.parse(r.approved),
        item = p.item,
        revision = "editedAt" in item ? item.editedAt : r.updated_at;
      return {
        id: r.id,
        kind: r.kind,
        revision,
        item,
        blocks: p.blocks,
        cover: p.cover,
        search:
          r.kind === "members"
            ? memberSearchEntries([item as Member])[0]
            : searchEntry(item as ContentItem),
      };
    });
    const payload = JSON.stringify(rows),
      snapshot = JSON.stringify(original),
      versions = JSON.stringify(
        approved.map((r) => ({ id: r.id, revision: r.approved_revision })),
      );
    if (new TextEncoder().encode(payload).length > 1800000)
      throw Error("Cutover snapshot exceeds atomic migration budget");
    await db.batch([
      db.prepare(
        "CREATE TABLE IF NOT EXISTS cms_legacy_public AS SELECT * FROM free_content WHERE 0",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS cms_cutover_guard(id INTEGER PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))",
      ),
    ]);
    await db.batch([
      db
        .prepare(
          `INSERT OR REPLACE INTO cms_cutover_guard SELECT 1,CASE WHEN
    (SELECT count(*) FROM free_content)=? AND
    NOT EXISTS(SELECT 1 FROM free_content c LEFT JOIN json_each(?) x ON x.value->>'$.id'=c.id WHERE x.value IS NULL OR x.value->>'$.revision'<>c.revision) AND
    NOT EXISTS(SELECT 1 FROM cms_entries e JOIN json_each(?) x ON x.value->>'$.id'=e.id WHERE e.approved_revision IS NOT x.value->>'$.revision' OR e.trashed_at IS NOT NULL) AND
    NOT EXISTS(SELECT 1 FROM cms_legacy_public) AND
    EXISTS(SELECT 1 FROM free_controls WHERE name='publisher' AND until_at=?)
    THEN 1 ELSE 0 END`,
        )
        .bind(original.length, snapshot, versions, until),
      db.prepare("INSERT INTO cms_legacy_public SELECT * FROM free_content"),
      db
        .prepare(
          `INSERT INTO free_content(id,kind,revision,item,search_entry,blocks,body_revision,cover)
    SELECT value->>'$.id',value->>'$.kind',value->>'$.revision',value->'$.item',value->'$.search',value->'$.blocks',value->>'$.revision',CASE WHEN value->>'$.cover' IS NULL THEN NULL ELSE value->'$.cover' END FROM json_each(?) WHERE true
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,item=excluded.item,search_entry=excluded.search_entry,blocks=excluded.blocks,body_revision=excluded.body_revision,cover=excluded.cover`,
        )
        .bind(payload),
      db.prepare(
        "INSERT INTO free_controls(name,until_at) VALUES('cms-source-admin',1)",
      ),
      db.prepare("DELETE FROM free_jobs"),
      db.prepare("DELETE FROM free_publication_checks"),
      ...documentStatements({ CMS_DB: db } as Parameters<
        typeof documentStatements
      >[0]),
    ]);
    return {
      source: "admin",
      published: rows.length,
      counts: Object.fromEntries(
        ["research", "notice", "members"].map((k) => [
          k,
          rows.filter((r) => r.kind === k).length,
        ]),
      ),
    };
  } finally {
    await db
      .prepare(
        "DELETE FROM free_controls WHERE name='publisher' AND until_at=?",
      )
      .bind(until)
      .run();
  }
}
