import { Buffer } from "node:buffer"
import type { Database, Statement } from "../cloudflare/bindings"
import type { Draft } from "../admin-lab/model"
import type { ObjectRow } from "./store"
import { HttpError } from "../admin-server/validation"
import { guardedBatch } from "./transaction"

export type ReportFile = {
  id: string
  provider: "d1" | "drive"
  identity: string
  identity_algorithm: string
  pdf_bytes: number
  cover_bytes: number
  file_id: string | null
  folder_id: string | null
  source_sha256: string | null
  managed: number
  state: "ready" | "pending-delete" | "deleted"
  created: number
  delete_after: number | null
  attempts: number
}
export const retentionMs = 30 * 86400000
// Counts each current file once and archived binary files once. Drive PDFs are
// metadata/proofs only; covers remain in the bounded D1 budget.
export const storageBytesSql = `(SELECT coalesce(sum(CASE WHEN s.provider='drive' THEN o.cover_bytes ELSE o.pdf_bytes+o.cover_bytes END),0)
  FROM objects o LEFT JOIN report_storage s ON s.object_id=o.id)
  +(SELECT coalesce(sum(bytes),0) FROM notice_assets)
  +(SELECT coalesce(sum(CASE WHEN f.provider='drive' THEN f.cover_bytes ELSE f.pdf_bytes+f.cover_bytes END),0)
    FROM report_files f WHERE f.state<>'deleted' AND NOT EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=f.id))`

export class ReportVersions {
  constructor(
    readonly db: Database,
    readonly now = Date.now(),
  ) {}
  async binding(id: string) {
    return this.db
      .prepare(
        "SELECT f.* FROM report_files f JOIN report_file_bindings b ON b.asset_id=f.id WHERE b.report_id=?",
      )
      .bind(id)
      .first<ReportFile>()
  }
  async newFile(row: ObjectRow) {
    const upload = await this.db
      .prepare("SELECT * FROM drive_uploads WHERE object_id=?")
      .bind(row.id)
      .first<{
        file_id: string
        folder_id: string
        verified: number
        source_sha256: string | null
      }>()
    const mode = await this.db
      .prepare("SELECT provider FROM report_storage WHERE object_id=?")
      .bind(row.id)
      .first<{ provider: string }>()
    if (mode?.provider === "drive" && !upload?.verified)
      throw new HttpError(409, "Drive 원본 검증이 아직 끝나지 않았어요.")
    const assetId = crypto.randomUUID()
    const statements = [
      this.db
        .prepare(
          `INSERT INTO report_files(id,provider,identity,pdf_bytes,cover_bytes,file_id,folder_id,source_sha256,managed,created)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          assetId,
          upload ? "drive" : "d1",
          row.hash,
          row.pdf_bytes,
          row.cover_bytes,
          upload?.file_id ?? null,
          upload?.folder_id ?? null,
          upload?.source_sha256 ?? null,
          upload ? 1 : 0,
          this.now,
        ),
    ]
    return { assetId, statements }
  }
  async snapshot(row: ObjectRow) {
    const binding = await this.binding(row.id)
    const result = binding
      ? { assetId: binding.id, statements: [] as Statement[] }
      : await this.newFile(row)
    if (!binding) result.statements.push(this.bindStatement(row.id, result.assetId))
    result.statements.push(this.versionStatement(JSON.parse(row.data), result.assetId))
    const draft: Draft = JSON.parse(row.data)
    if (draft.approvedRevision === draft.revision && draft.approvedAt) {
      result.statements.push(
        this.db
          .prepare(
            "INSERT OR IGNORE INTO report_releases(report_id,approved_revision,approved_at) VALUES(?,?,?)",
          )
          .bind(row.id, draft.revision, draft.approvedAt),
      )
    }
    return result
  }
  bindStatement(id: string, assetId: string) {
    return this.db
      .prepare(
        `INSERT INTO report_file_bindings(report_id,asset_id) VALUES(?,?)
      ON CONFLICT(report_id) DO UPDATE SET asset_id=excluded.asset_id`,
      )
      .bind(id, assetId)
  }
  versionStatement(draft: Draft, assetId: string) {
    return this.db
      .prepare(
        "INSERT OR IGNORE INTO report_versions(report_id,revision,asset_id,data,created) VALUES(?,?,?,?,?)",
      )
      .bind(draft.id, draft.revision, assetId, JSON.stringify(draft), this.now)
  }
  archiveStatement(id: string, assetId: string) {
    return this.db
      .prepare(
        `INSERT OR IGNORE INTO archived_report_chunks(asset_id,kind,part,bytes,hash,data)
      SELECT ?,kind,part,bytes,hash,data FROM chunks WHERE object_id=?`,
      )
      .bind(assetId, id)
  }
  releaseStatements(next: Draft, approved = false): Statement[] {
    if (approved)
      return [
        this.db
          .prepare(
            `INSERT INTO report_releases(report_id,approved_revision,approved_at) VALUES(?,?,?)
        ON CONFLICT(report_id) DO UPDATE SET approved_revision=excluded.approved_revision,approved_at=excluded.approved_at`,
          )
          .bind(next.id, next.revision, next.approvedAt),
        this.db.prepare("UPDATE report_jobs SET state='cancelled' WHERE report_id=?").bind(next.id),
        this.db
          .prepare(
            "INSERT INTO report_jobs(report_id,revision,state,created) VALUES(?,?,'waiting',?)",
          )
          .bind(next.id, next.revision, this.now),
      ]
    if (next.trashedAt)
      return [
        this.db.prepare("UPDATE report_jobs SET state='cancelled' WHERE report_id=?").bind(next.id),
      ]
    return [] // Editing preserves the previous immutable approval.
  }
  async approved(id: string) {
    const row = await this.db
      .prepare(
        `SELECT v.data,v.asset_id FROM report_releases r JOIN report_versions v
      ON v.report_id=r.report_id AND v.revision=r.approved_revision JOIN objects o ON o.id=r.report_id
      WHERE r.report_id=? AND r.owner='admin-trial' AND json_extract(o.data,'$.trashedAt') IS NULL`,
      )
      .bind(id)
      .first<{ data: string; asset_id: string }>()
    if (!row) throw new HttpError(404, "보관된 승인본이 없거나 휴지통에 있어요.")
    const file = await this.db
      .prepare("SELECT * FROM report_files WHERE id=? AND state='ready'")
      .bind(row.asset_id)
      .first<ReportFile>()
    if (!file) throw new HttpError(503, "승인본 파일을 확인하지 못했어요.")
    return { draft: JSON.parse(row.data) as Draft, file }
  }
  async enrich(drafts: Draft[]) {
    const { results } = await this.db
      .prepare(
        `SELECT r.report_id,r.approved_revision,r.approved_at,v.data
      FROM report_releases r JOIN report_versions v ON v.report_id=r.report_id AND v.revision=r.approved_revision`,
      )
      .all<{
        report_id: string
        approved_revision: number
        approved_at: string
        data: string
      }>()
    const releases = new Map(results.map((row) => [row.report_id, row]))
    return drafts.map((draft) => {
      const r = releases.get(draft.id)
      return {
        ...draft,
        ...(r
          ? {
              release: {
                revision: r.approved_revision,
                at: r.approved_at,
                title: JSON.parse(r.data).fields.title,
              },
            }
          : {}),
      }
    })
  }
  async assetParts(file: ReportFile, kind: "pdf" | "cover", part?: number) {
    const active = await this.db
      .prepare("SELECT report_id FROM report_file_bindings WHERE asset_id=? LIMIT 1")
      .bind(file.id)
      .first<{ report_id: string }>()
    const table = active ? "chunks" : "archived_report_chunks",
      column = active ? "object_id" : "asset_id"
    const query = this.db.prepare(
      `SELECT part,bytes,hash,data FROM ${table} WHERE ${column}=? AND kind=?${part === undefined ? "" : " AND part=?"} ORDER BY part`,
    )
    return (
      await query
        .bind(active?.report_id ?? file.id, kind, ...(part === undefined ? [] : [part]))
        .all<{ part: number; bytes: number; hash: string; data: string }>()
    ).results
  }
  async purgeStatements(row: ObjectRow, quarantine = retentionMs) {
    // Removing a report does not need a new content revision. Keep a file
    // tombstone and its bytes until quarantine expires, including legacy files.
    const binding = await this.binding(row.id)
    const file = binding
      ? { assetId: binding.id, statements: [] as Statement[] }
      : await this.newFile(row)
    return [
      ...file.statements,
      this.archiveStatement(row.id, file.assetId),
      this.db
        .prepare(
          `UPDATE report_files SET state='pending-delete',delete_after=max(coalesce(delete_after,0),?)
        WHERE id=? OR id IN (SELECT asset_id FROM report_versions WHERE report_id=?)`,
        )
        .bind(this.now + quarantine, file.assetId, row.id),
      this.db.prepare("DELETE FROM objects WHERE id=?").bind(row.id),
      // A file shared by another report/version must remain readable.
      this.db
        .prepare(`UPDATE report_files SET state='ready',delete_after=NULL WHERE state='pending-delete'
        AND (EXISTS(SELECT 1 FROM report_versions v WHERE v.asset_id=report_files.id)
        OR EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=report_files.id))`),
    ]
  }
  async expireTrash(limit = 2) {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM objects WHERE status='ready' AND json_extract(data,'$.trashedAt')<? LIMIT ?",
      )
      .bind(new Date(this.now - retentionMs).toISOString(), limit)
      .all<ObjectRow>()
    for (const row of results) {
      await guardedBatch(
        this.db,
        "EXISTS(SELECT 1 FROM objects WHERE id=? AND revision=? AND json_extract(data,'$.trashedAt')<?)",
        [row.id, row.revision, new Date(this.now - retentionMs).toISOString()],
        await this.purgeStatements(row, 0),
      )
    }
  }
  async cleanupLocal() {
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM archived_report_chunks WHERE asset_id IN (SELECT f.id FROM report_files f
        WHERE f.provider='d1' AND f.state='pending-delete' AND f.delete_after<=?
        AND NOT EXISTS(SELECT 1 FROM report_versions v WHERE v.asset_id=f.id)
        AND NOT EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=f.id))`,
        )
        .bind(this.now),
      this.db
        .prepare(
          `UPDATE report_files SET state='deleted' WHERE provider='d1' AND state='pending-delete' AND delete_after<=?
        AND NOT EXISTS(SELECT 1 FROM report_versions v WHERE v.asset_id=report_files.id)
        AND NOT EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=report_files.id)`,
        )
        .bind(this.now),
    ])
  }
  async cover(file: ReportFile) {
    return new Uint8Array(
      Buffer.concat(
        (await this.assetParts(file, "cover")).map((part) => Buffer.from(part.data, "base64")),
      ),
    )
  }
}
