import type { Database, Statement } from "../cloudflare/bindings";
import type { ContentItem } from "../lib/content-model";
import { memberSearchEntries, type Member } from "../lib/member-model";
import { searchEntry, documentStatements } from "../free/server/catalog";
import { sourceKey } from "../lib/report-source-key";
import { HttpError } from "../admin-server/validation";
import { adminMode } from "./mode";
import {
  cmsLimits,
  validatePayload,
  type Kind,
  type Payload,
  type Entry,
} from "./model";

type Row = {
  id: string;
  kind: Kind;
  draft: string;
  revision: number;
  approved_revision: number | null;
  updated_at: string;
  trashed_at: string | null;
  source: string;
  rank: number;
  pending: number;
  error: string | null;
};
const decode = (r: Row): Entry => ({
  id: r.id,
  kind: r.kind,
  draft: JSON.parse(r.draft),
  revision: r.revision,
  approvedRevision: r.approved_revision,
  updatedAt: r.updated_at,
  trashedAt: r.trashed_at,
  source: r.source,
  rank: r.rank,
  pending: !!r.pending,
  error: r.error,
});
const select = `SELECT e.*,j.id IS NOT NULL AS pending,j.error FROM cms_entries e LEFT JOIN cms_jobs j ON j.id=e.id`;
export function publicStatements(
  db: Database,
  id: string,
  revision: number,
  p: Payload,
): Statement[] {
  const item = p.item,
    kind = "kind" in item ? item.kind : "members",
    entry =
      kind === "members"
        ? memberSearchEntries([item as Member])[0]
        : searchEntry(item as ContentItem),
    rev = "editedAt" in item ? item.editedAt! : new Date().toISOString();
  return [
    db
      .prepare(
        `INSERT INTO free_content(id,kind,revision,item,search_entry,blocks,body_revision,cover)
    SELECT id,kind,?,?,?,?,?,? FROM cms_entries WHERE id=? AND revision=? AND approved_revision=? AND trashed_at IS NULL
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,item=excluded.item,search_entry=excluded.search_entry,blocks=excluded.blocks,body_revision=excluded.body_revision,cover=excluded.cover`,
      )
      .bind(
        rev,
        JSON.stringify(item),
        JSON.stringify(entry),
        JSON.stringify(p.blocks),
        rev,
        p.cover ? JSON.stringify(p.cover) : null,
        id,
        revision,
        revision,
      ),
    db.prepare("DELETE FROM free_publication_checks WHERE id=?").bind(id),
    db.prepare("DELETE FROM free_jobs WHERE id=?").bind(id),
  ];
}
export class CmsStore {
  constructor(
    readonly db: Database,
    readonly now = Date.now(),
  ) {}
  async status() {
    return {
      active: await adminMode(this.db),
      ...(await this.db
        .prepare(
          `SELECT count(*) AS total,
    sum(kind='research') AS research,sum(kind='notice') AS notice,sum(kind='members') AS members,
    (SELECT count(*) FROM cms_jobs) AS pending FROM cms_entries WHERE trashed_at IS NULL`,
        )
        .first()),
    };
  }
  async list(kind: Kind, params: URLSearchParams) {
    const q = (params.get("q") ?? "").slice(0, 150),
      page = Math.max(1, Math.min(100, Number(params.get("page")) || 1)),
      trash = params.get("trash") === "1",
      group = (params.get("group") ?? "").slice(0, 30),
      state = params.get("state") ?? "all";
    const where = `e.kind=? AND e.trashed_at IS ${trash ? "NOT " : ""}NULL AND (?='' OR json_extract(e.draft,'$.item.title') LIKE ? ESCAPE '\\' OR json_extract(e.draft,'$.item.name') LIKE ? ESCAPE '\\' OR json_extract(e.draft,'$.item.company') LIKE ? ESCAPE '\\' OR json_extract(e.draft,'$.item.ticker') LIKE ? ESCAPE '\\') AND (?='' OR COALESCE(json_extract(e.draft,'$.item.semester'),CAST(json_extract(e.draft,'$.item.generation') AS TEXT))=?) AND (?='all' OR (?='public' AND e.approved_revision IS NOT NULL) OR (?='draft' AND (e.approved_revision IS NULL OR e.approved_revision<>e.revision)))`;
    const match = `%${q.replace(/[\\%_]/g, "\\$&")}%`,
      values = [
        kind,
        q,
        match,
        match,
        match,
        match,
        group,
        group,
        state,
        state,
        state,
      ];
    const total = await this.db
      .prepare(`SELECT count(*) AS n FROM cms_entries e WHERE ${where}`)
      .bind(...values)
      .first<{ n: number }>();
    const projection = `SELECT e.id,e.kind,json_object('item',json_extract(e.draft,'$.item'),'blocks',json('[]'),'cover',NULL) AS draft,e.revision,e.approved_revision,e.updated_at,e.trashed_at,e.source,e.rank,j.id IS NOT NULL AS pending,j.error FROM cms_entries e LEFT JOIN cms_jobs j ON j.id=e.id`;
    const ordering =
      kind === "members"
        ? `CAST(json_extract(e.draft,'$.item.generation') AS INTEGER) DESC,CASE WHEN EXISTS(SELECT 1 FROM json_each(e.draft,'$.item.roles') WHERE value='회장') THEN 0 WHEN EXISTS(SELECT 1 FROM json_each(e.draft,'$.item.roles') WHERE value='부회장') THEN 1 WHEN EXISTS(SELECT 1 FROM json_each(e.draft,'$.item.roles') WHERE value='기장') THEN 2 ELSE 3 END,json_extract(e.draft,'$.item.name'),e.id`
        : "e.rank,e.id";
    const rows = await this.db
      .prepare(
        `${projection} WHERE ${where} ORDER BY ${ordering} LIMIT 40 OFFSET ?`,
      )
      .bind(...values, (page - 1) * 40)
      .all<Row>();
    const groups = await this.db
      .prepare(
        `SELECT DISTINCT COALESCE(json_extract(draft,'$.item.semester'),CAST(json_extract(draft,'$.item.generation') AS TEXT)) AS name FROM cms_entries WHERE kind=? AND trashed_at IS NULL ORDER BY name DESC`,
      )
      .bind(kind)
      .all<{ name: string | null }>();
    return {
      items: rows.results
        .map(decode)
        .map((e) => ({
          ...e,
          draft: { item: e.draft.item, blocks: [], cover: null },
        })),
      total: total?.n ?? 0,
      page,
      groups: groups.results.map((g) => g.name).filter(Boolean),
    };
  }
  async get(id: string) {
    const row = await this.db
      .prepare(`${select} WHERE e.id=?`)
      .bind(id)
      .first<Row>();
    if (!row) throw new HttpError(404, "자료를 찾지 못했어요.");
    return decode(row);
  }
  async create(kind: Kind, input: unknown) {
    const count = await this.db
      .prepare("SELECT count(*) AS n FROM cms_entries")
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= cmsLimits.entries)
      throw new HttpError(409, "관리 자료 한도에 도달했어요.");
    const id = crypto.randomUUID().replaceAll("-", ""),
      date = new Date(this.now).toISOString(),
      p = input as Payload;
    p.item = { ...p.item, id };
    if (kind !== "members")
      p.item = { ...p.item, kind, editedAt: date } as ContentItem;
    p.cover = null;
    delete p.original;
    delete p.upload;
    try {
      validatePayload(p, kind, id);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    await this.db
      .prepare(
        `INSERT INTO cms_entries(id,kind,draft,updated_at,rank) VALUES(?,?,?,?,COALESCE((SELECT MIN(rank)-1024 FROM cms_entries WHERE kind=?),0))`,
      )
      .bind(id, kind, JSON.stringify(p), date, kind)
      .run();
    return this.get(id);
  }
  async save(id: string, revision: number, input: unknown) {
    const previous = await this.get(id);
    this.current(previous, revision);
    const candidate = input as Payload,
      p = {
        item: candidate.item,
        blocks: candidate.blocks,
        cover: previous.draft.cover,
        ...(previous.draft.original
          ? { original: previous.draft.original }
          : {}),
        ...(previous.draft.upload ? { upload: previous.draft.upload } : {}),
      };
    if (previous.kind === "research")
      (p.item as ContentItem).managedPdf = (
        previous.draft.item as ContentItem
      ).managedPdf;
    if (previous.kind !== "members")
      (p.item as ContentItem).editedAt = new Date(this.now).toISOString();
    try {
      validatePayload(p, previous.kind, id);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const result = await this.db
      .prepare(
        `UPDATE cms_entries SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND trashed_at IS NULL RETURNING id`,
      )
      .bind(JSON.stringify(p), new Date(this.now).toISOString(), id, revision)
      .first();
    if (!result)
      throw new HttpError(
        409,
        "다른 변경이 저장됐어요. 새로고침 후 다시 확인해 주세요.",
      );
    // Editing never replaces the approved public edition. An in-flight job is
    // invalidated by its revision check, so an old PDF cannot overwrite a new edit.
    await this.db
      .prepare("DELETE FROM cms_jobs WHERE id=? AND revision<=?")
      .bind(id, revision)
      .run();
    return this.get(id);
  }
  current(entry: Entry, revision: number) {
    if (entry.revision !== revision || entry.trashedAt)
      throw new HttpError(
        409,
        "자료가 변경됐거나 휴지통에 있어요. 새로고침해 주세요.",
      );
  }
  async approve(id: string, revision: number) {
    const e = await this.get(id);
    this.current(e, revision);
    const p = e.draft;
    validatePayload(p, e.kind, id);
    const date = (p.item as ContentItem).date;
    if (
      e.kind !== "members" &&
      Date.parse(date.length === 10 ? `${date}T00:00:00+09:00` : date) >
        this.now
    )
      throw new HttpError(
        400,
        "게시일이 아직 오지 않았어요. 해당 날짜에 게시해 주세요.",
      );
    const needsAssets =
      e.kind === "research" &&
      (!(p.cover as { sourceKey?: string } | null)?.sourceKey ||
        (p.cover as { sourceKey?: string }).sourceKey !==
          sourceKey(p.item as ContentItem));
    if (needsAssets) {
      await this.db
        .prepare(
          `INSERT INTO cms_jobs(id,revision,payload,next_at) SELECT id,revision,draft,? FROM cms_entries WHERE id=? AND revision=? AND trashed_at IS NULL ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,next_at=excluded.next_at,attempts=0,lease_until=0,error=NULL`,
        )
        .bind(this.now, id, revision)
        .run();
      return this.get(id);
    }
    await this.complete(id, revision, p);
    return this.get(id);
  }
  async complete(id: string, revision: number, p: Payload) {
    const active = await adminMode(this.db);
    const statements = [
      this.db
        .prepare(
          `INSERT OR IGNORE INTO cms_history(id,revision,payload,saved_at) SELECT id,approved_revision,approved,? FROM cms_entries WHERE id=? AND revision=? AND approved IS NOT NULL`,
        )
        .bind(new Date(this.now).toISOString(), id, revision),
      this.db
        .prepare(
          "UPDATE cms_entries SET draft=?,approved=?,approved_revision=? WHERE id=? AND revision=? AND trashed_at IS NULL",
        )
        .bind(JSON.stringify(p), JSON.stringify(p), revision, id, revision),
      ...(active ? publicStatements(this.db, id, revision, p) : []),
      this.db
        .prepare("DELETE FROM cms_jobs WHERE id=? AND revision=?")
        .bind(id, revision),
      this.db
        .prepare(
          `DELETE FROM cms_history WHERE id=? AND revision NOT IN(SELECT revision FROM cms_history WHERE id=? ORDER BY revision DESC LIMIT ?)`,
        )
        .bind(id, id, cmsLimits.history),
    ];
    // Guarding the public INSERT by the same revision makes concurrent edits or
    // withdrawals fail closed, including a publisher finishing after trash.
    await this.db.batch(statements);
    if (active)
      await this.db.batch(
        documentStatements(
          { CMS_DB: this.db } as Parameters<typeof documentStatements>[0],
          ["kind" in p.item ? p.item.kind : "members"],
        ),
      );
  }
  async change(
    id: string,
    revision: number,
    action: "withdraw" | "trash" | "restore",
  ) {
    const e = await this.get(id);
    if (e.revision !== revision)
      throw new HttpError(409, "변경된 자료를 새로고침해 주세요.");
    if (action === "restore") {
      await this.db
        .prepare(
          "UPDATE cms_entries SET trashed_at=NULL,revision=revision+1 WHERE id=? AND revision=?",
        )
        .bind(id, revision)
        .run();
      return this.get(id);
    }
    const statements = [
      this.db
        .prepare(
          `INSERT OR IGNORE INTO cms_history SELECT id,approved_revision,approved,? FROM cms_entries WHERE id=? AND revision=? AND approved IS NOT NULL`,
        )
        .bind(new Date(this.now).toISOString(), id, revision),
      this.db
        .prepare(
          `UPDATE cms_entries SET approved=NULL,approved_revision=NULL,revision=revision+1,trashed_at=? WHERE id=? AND revision=?`,
        )
        .bind(
          action === "trash" ? new Date(this.now).toISOString() : null,
          id,
          revision,
        ),
      this.db
        .prepare("DELETE FROM cms_jobs WHERE id=? AND revision<=?")
        .bind(id, revision),
      this.db.prepare("DELETE FROM cms_export_grants WHERE id=?").bind(id),
    ];
    const active = await adminMode(this.db);
    if (active)
      statements.push(
        this.db
          .prepare(
            "DELETE FROM free_content WHERE id=? AND EXISTS(SELECT 1 FROM cms_entries WHERE id=? AND approved IS NULL)",
          )
          .bind(id, id),
        this.db
          .prepare("DELETE FROM free_publication_checks WHERE id=?")
          .bind(id),
        this.db.prepare("DELETE FROM free_jobs WHERE id=?").bind(id),
      );
    await this.db.batch(statements);
    if (active)
      await this.db.batch(
        documentStatements(
          { CMS_DB: this.db } as Parameters<typeof documentStatements>[0],
          [e.kind],
        ),
      );
    return this.get(id);
  }
}
