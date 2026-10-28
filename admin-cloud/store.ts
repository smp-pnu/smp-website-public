import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import { applyCommand, limits, type Draft } from "../admin-lab/model"
import {
  HttpError,
  bad,
  command,
  evidence,
  fields,
  object,
  text,
  warnings,
} from "../admin-server/validation"
import { chunkBytes, coverLimit, manifestHash } from "./protocol"
import { guardedBatch } from "./transaction"
import { ReportVersions, storageBytesSql, retentionMs } from "./report-versions"
import { adminDailyRequests } from "./operation-limits"
export type ObjectRow = {
  id: string
  hash: string
  status: "staging" | "ready"
  owner: string
  pdf_bytes: number
  cover_bytes: number
  revision: number
  expires: number | null
  data: string
}
export type ChunkRow = { part: number; bytes: number; hash: string; data: string }
export class CloudStore {
  constructor(
    readonly db: Database,
    readonly now = Date.now(),
  ) {}
  async cleanup() {
    // On admin activity, at most once per hour. No scheduled billable work.
    const lease = await this.db
      .prepare(
        "INSERT INTO usage(key,hits,expires) VALUES('housekeeping',1,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE expires<=? RETURNING key",
      )
      .bind(this.now + 3600000, this.now)
      .first()
    if (!lease) return
    const versions = new ReportVersions(this.db, this.now)
    await versions.expireTrash()
    await versions.cleanupLocal()
    const cutoff = new Date(this.now - 30 * 86400000).toISOString()
    await this.db.batch([
      this.abandonExpired(),
      this.db.prepare("DELETE FROM objects WHERE status='staging' AND expires<?").bind(this.now),
      this.db.prepare("DELETE FROM notices WHERE json_extract(data,'$.trashedAt')<?").bind(cutoff),
      this.db
        .prepare("DELETE FROM notice_assets WHERE expires IS NOT NULL AND expires<?")
        .bind(this.now),
      this.db.prepare("DELETE FROM upload_receipts WHERE expires<?").bind(this.now),
      this.db.prepare("DELETE FROM metadata_extractions WHERE expires<?").bind(this.now),
      this.db.prepare("DELETE FROM usage WHERE expires<?").bind(this.now),
    ])
  }
  async overview() {
    return this.db
      .prepare(
        `SELECT (SELECT count(*) FROM objects WHERE status='ready') AS reports,
      (SELECT count(*) FROM notices) AS notices, (SELECT count(*) FROM objects WHERE status='staging') AS pending,
      ${storageBytesSql} AS bytes`,
      )
      .first<{ reports: number; notices: number; pending: number; bytes: number }>()
  }
  async budget() {
    const day = Math.floor(this.now / 86_400_000),
      minute = Math.floor(this.now / 60_000)
    // Bounded atomic counters. Only passkey-authenticated content requests reach this budget.
    for (const [key, max, expires] of [
      [`day:${day}`, adminDailyRequests, (day + 1) * 86_400_000],
      [`minute:${minute}`, 600, (minute + 1) * 60_000],
    ] as const) {
      const accepted = await this.db
        .prepare(
          "INSERT INTO usage(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits",
        )
        .bind(key, expires, max)
        .first()
      if (!accepted)
        throw new HttpError(429, "무료 시험 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.")
    }
  }
  async get(id: string, ready = true) {
    const row = await this.db
      .prepare("SELECT * FROM objects WHERE id=?")
      .bind(id)
      .first<ObjectRow>()
    if (!row || (ready && row.status !== "ready"))
      throw new HttpError(404, "리포트를 찾지 못했어요.")
    return row
  }
  async list(): Promise<Draft[]> {
    const { results } = await this.db
      .prepare("SELECT data FROM objects WHERE status='ready' ORDER BY rowid DESC")
      .all<{ data: string }>()
    return new ReportVersions(this.db, this.now).enrich(results.map((row) => JSON.parse(row.data)))
  }
  abandonExpired() {
    return this.db
      .prepare(
        `INSERT OR IGNORE INTO abandoned_drive_files(file_id,folder_id,upload_id,delete_after)
      SELECT d.file_id,d.folder_id,d.object_id,? FROM drive_uploads d JOIN objects o ON o.id=d.object_id WHERE d.file_id<>'' AND o.status='staging' AND o.expires<?`,
      )
      .bind(this.now + retentionMs, this.now)
  }
  async begin(input: unknown, owner: string, drive = false) {
    const value = object(input),
      filename = text(value.filename, 180),
      hash = text(value.hash, 64)
    if (!/^[a-f0-9]{64}$/.test(hash) || !/\.pdf$/i.test(filename) || /[\\/\r\n]/.test(filename))
      bad("파일 정보를 확인해 주세요.")
    const bytes = Number(value.fileBytes),
      cover = Number(value.coverBytes),
      pages = Number(value.pages)
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 8 ||
      bytes > limits.fileBytes ||
      !Number.isSafeInteger(cover) ||
      cover < 12 ||
      cover > coverLimit ||
      !Number.isSafeInteger(pages) ||
      pages < 1 ||
      pages > limits.pages
    )
      bad("파일 크기와 페이지 수를 확인해 주세요.")
    const replacement = value.replace ? object(value.replace) : null
    const target = replacement ? await this.get(text(replacement.id, 36)) : null
    if (target && (target.revision !== replacement!.revision || JSON.parse(target.data).trashedAt))
      throw new HttpError(409, "교체할 초안이 변경됐어요. 새로고침해 주세요.")
    if (target?.hash === hash) return { draft: JSON.parse(target.data) as Draft }
    const duplicate = target
      ? await this.db
          .prepare("SELECT id,status FROM objects WHERE hash=?")
          .bind(hash)
          .first<{ id: string; status: string }>()
      : null
    if (duplicate) {
      const mapping = await this.db
        .prepare("SELECT target_id,revision FROM replacements WHERE upload_id=?")
        .bind(duplicate.id)
        .first<{ target_id: string; revision: number }>()
      if (!mapping || mapping.target_id !== target!.id || mapping.revision !== target!.revision)
        throw new HttpError(409, "다른 리포트에 이미 등록된 PDF입니다.")
    }
    const now = new Date(this.now).toISOString()
    const draft: Draft = {
      id: crypto.randomUUID(),
      hash,
      filename,
      fileBytes: bytes,
      storedBytes: drive ? cover : bytes + cover,
      pages,
      fields: fields(value.fields),
      evidence: evidence(value.evidence, pages),
      warnings: warnings(value.warnings),
      revision: 1,
      approvedRevision: null,
      approvedAt: null,
      updatedAt: now,
      createdAt: now,
      trashedAt: null,
    }
    const inserts = [
      this.abandonExpired(),
      this.db.prepare("DELETE FROM objects WHERE status='staging' AND expires<?").bind(this.now),
      this.db.prepare("DELETE FROM usage WHERE expires<?").bind(this.now),
      this.db
        .prepare(
          `INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,expires,data)
        SELECT ?,?,'staging',?,?,?,?,? WHERE (SELECT count(*) FROM objects)<?
        AND ${storageBytesSql}+?<=?
        AND NOT EXISTS(SELECT 1 FROM objects WHERE status='staging') ON CONFLICT(hash) DO NOTHING`,
        )
        .bind(
          draft.id,
          hash,
          owner,
          bytes,
          cover,
          this.now + 30 * 60_000,
          JSON.stringify(draft),
          (drive ? 500 : limits.drafts) + (target ? 1 : 0),
          drive ? cover : bytes + cover,
          limits.totalBytes,
        ),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO report_storage(object_id,provider) SELECT id,? FROM objects WHERE id=?",
        )
        .bind(drive ? "drive" : "d1", draft.id),
    ]
    if (target) {
      inserts.push(
        this.db
          .prepare(
            "INSERT OR IGNORE INTO replacements(upload_id,target_id,revision) SELECT id,?,? FROM objects WHERE hash=? AND status='staging'",
          )
          .bind(target.id, target.revision, hash),
      )
      await guardedBatch(
        this.db,
        "EXISTS(SELECT 1 FROM objects WHERE id=? AND revision=? AND status='ready' AND json_extract(data,'$.trashedAt') IS NULL)",
        [target.id, target.revision],
        inserts,
      )
    } else await this.db.batch(inserts)
    const row = await this.db
      .prepare("SELECT * FROM objects WHERE hash=?")
      .bind(hash)
      .first<ObjectRow>()
    if (!row)
      throw new HttpError(
        409,
        `다른 업로드가 진행 중이거나 시험 저장 한도(${drive ? 500 : 50}개·DB 파일 200MB)에 도달했어요. 중단된 업로드는 30분 뒤 정리 대상이 됩니다.`,
      )
    if (row.owner !== owner || row.pdf_bytes !== bytes)
      throw new HttpError(409, "기존 업로드 정보를 확인해 주세요.")
    return row.status === "ready" ? { draft: JSON.parse(row.data) as Draft } : { id: row.id }
  }
  async stage(id: string, owner: string) {
    const row = await this.get(id, false)
    if (row.owner !== owner || row.status !== "staging" || !row.expires || row.expires <= this.now)
      throw new HttpError(409, "업로드가 만료됐거나 이미 완료됐어요. 다시 선택해 주세요.")
    return row
  }
  async put(
    row: ObjectRow,
    kind: "pdf" | "cover",
    part: number,
    data: string,
    bytes: number,
    hash: string,
  ) {
    const previous = await this.db
      .prepare("SELECT hash FROM chunks WHERE object_id=? AND kind=? AND part=?")
      .bind(row.id, kind, part)
      .first<{ hash: string }>()
    if (previous && previous.hash !== hash)
      throw new HttpError(409, "같은 업로드의 파일 내용이 달라졌어요.")
    await this.db
      .prepare(
        `INSERT INTO chunks(object_id,kind,part,bytes,hash,data)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM objects WHERE id=? AND status='staging' AND expires>?)
      ON CONFLICT(object_id,kind,part) DO NOTHING`,
      )
      .bind(row.id, kind, part, bytes, hash, data, row.id, this.now)
      .run()
  }
  async parts(id: string, kind: string, withData = false) {
    return (
      await this.db
        .prepare(
          `SELECT part,bytes,hash${withData ? ",data" : ""} FROM chunks WHERE object_id=? AND kind=? ORDER BY part`,
        )
        .bind(id, kind)
        .all<ChunkRow>()
    ).results
  }
  async finish(id: string, owner: string) {
    const receipt = await this.db
      .prepare("SELECT target_id FROM upload_receipts WHERE id=? AND owner=? AND expires>?")
      .bind(id, owner, this.now)
      .first<{ target_id: string }>()
    if (receipt) return JSON.parse((await this.get(receipt.target_id)).data) as Draft
    const existing = await this.get(id, false)
    if (existing.status === "ready" && existing.owner === owner)
      return JSON.parse(existing.data) as Draft
    const row = await this.stage(id, owner)
    const pdf = await this.parts(id, "pdf"),
      cover = await this.parts(id, "cover")
    for (const [parts, total] of [
      [pdf, row.pdf_bytes],
      [cover, row.cover_bytes],
    ] as const) {
      if (
        parts.length !== Math.ceil(total / chunkBytes) ||
        parts.some(
          (p, i) => p.part !== i || p.bytes !== Math.min(chunkBytes, total - i * chunkBytes),
        )
      )
        throw new HttpError(409, "파일 전송이 아직 끝나지 않았어요. 다시 선택하면 이어서 처리해요.")
    }
    if ((await manifestHash(pdf)) !== row.hash)
      throw new HttpError(400, "PDF 전송 검증에 실패했어요. 원본을 다시 선택해 주세요.")
    // Read only the ends of the last two chunks: %%EOF may straddle their boundary.
    const tails = await this.db
      .prepare(
        "SELECT substr(data,-2732) AS data FROM chunks WHERE object_id=? AND kind='pdf' AND part>=? ORDER BY part",
      )
      .bind(id, Math.max(0, pdf.length - 2))
      .all<{ data: string }>()
    const tail = Buffer.concat(tails.results.map((p) => Buffer.from(p.data, "base64")))
      .subarray(-2048)
      .toString("latin1")
    if (!tail.includes("%%EOF"))
      throw new HttpError(400, "PDF 끝부분을 확인하지 못했어요. 완전한 원본을 선택해 주세요.")
    const replacement = await this.db
      .prepare("SELECT target_id,revision FROM replacements WHERE upload_id=?")
      .bind(id)
      .first<{ target_id: string; revision: number }>()
    if (replacement) {
      const previous = await this.get(replacement.target_id),
        old: Draft = JSON.parse(previous.data),
        incoming: Draft = JSON.parse(row.data)
      const next: Draft = {
        ...incoming,
        id: old.id,
        fields: old.fields,
        evidence: [],
        warnings: [
          "PDF를 교체했습니다. 기존 입력값을 새 원문과 확인하거나 입력 후보를 다시 추출해 주세요.",
        ],
        createdAt: old.createdAt,
        updatedAt: new Date(this.now).toISOString(),
        revision: replacement.revision + 1,
        approvedRevision: null,
        approvedAt: null,
      }
      const versions = new ReportVersions(this.db, this.now)
      const previousSnapshot = await versions.snapshot(previous)
      const incomingFile = await versions.newFile(row)
      await guardedBatch(
        this.db,
        "EXISTS(SELECT 1 FROM objects WHERE id=? AND revision=? AND status='ready' AND json_extract(data,'$.trashedAt') IS NULL) AND EXISTS(SELECT 1 FROM objects WHERE id=? AND status='staging' AND expires>?)",
        [old.id, replacement.revision, id, this.now],
        [
          ...previousSnapshot.statements,
          versions.archiveStatement(old.id, previousSnapshot.assetId),
          ...incomingFile.statements,
          this.db.prepare("DELETE FROM chunks WHERE object_id=?").bind(old.id),
          this.db.prepare("UPDATE chunks SET object_id=? WHERE object_id=?").bind(old.id, id),
          this.db
            .prepare(
              `INSERT INTO report_storage(object_id,provider) SELECT ?,provider FROM report_storage WHERE object_id=?
            ON CONFLICT(object_id) DO UPDATE SET provider=excluded.provider`,
            )
            .bind(old.id, id),
          this.db.prepare("DELETE FROM objects WHERE id=?").bind(id),
          this.db
            .prepare(
              "UPDATE objects SET hash=?,pdf_bytes=?,cover_bytes=?,revision=?,data=? WHERE id=?",
            )
            .bind(
              row.hash,
              row.pdf_bytes,
              row.cover_bytes,
              next.revision,
              JSON.stringify(next),
              old.id,
            ),
          versions.bindStatement(old.id, incomingFile.assetId),
          versions.versionStatement(next, incomingFile.assetId),
          this.db
            .prepare("INSERT INTO upload_receipts(id,target_id,owner,expires) VALUES(?,?,?,?)")
            .bind(id, old.id, owner, this.now + 3600000),
          this.db.prepare("DELETE FROM metadata_extractions"),
        ],
      )
      return next
    }
    const versions = new ReportVersions(this.db, this.now)
    const file = await versions.newFile(row)
    await guardedBatch(
      this.db,
      "EXISTS(SELECT 1 FROM objects WHERE id=? AND status='staging' AND expires>?)",
      [id, this.now],
      [
        this.db.prepare("UPDATE objects SET status='ready',expires=NULL WHERE id=?").bind(id),
        ...file.statements,
        versions.bindStatement(id, file.assetId),
        versions.versionStatement(JSON.parse(row.data), file.assetId),
        this.db.prepare("DELETE FROM drive_uploads WHERE object_id=?").bind(id),
      ],
    )
    return JSON.parse(row.data) as Draft
  }
  async cancel(id: string, owner: string) {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO abandoned_drive_files(file_id,folder_id,upload_id,delete_after)
        SELECT d.file_id,d.folder_id,d.object_id,? FROM drive_uploads d JOIN objects o ON o.id=d.object_id WHERE d.file_id<>'' AND o.id=? AND o.status='staging' AND o.owner=?`,
        )
        .bind(this.now + retentionMs, id, owner),
      this.db
        .prepare("DELETE FROM objects WHERE id=? AND status='staging' AND owner=?")
        .bind(id, owner),
    ])
  }
  async change(id: string, revision: number, raw: unknown) {
    const row = await this.get(id),
      draft = JSON.parse(row.data) as Draft
    if (row.revision !== revision)
      throw new HttpError(409, "다른 창에서 변경됐어요. 목록을 새로고침해 주세요.")
    let next: Draft | null
    try {
      next = applyCommand(draft, command(raw, draft.pages), new Date(this.now).toISOString())
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
    // Every command advances the DB revision, including approval, to prevent lost updates.
    if (next) {
      next.revision = revision + 1
      if (next.approvedRevision !== null) next.approvedRevision = next.revision
    }
    if (!next) {
      await guardedBatch(
        this.db,
        "EXISTS(SELECT 1 FROM objects WHERE id=? AND revision=? AND status='ready')",
        [id, revision],
        [
          ...(await new ReportVersions(this.db, this.now).purgeStatements(row)),
          this.db.prepare("DELETE FROM metadata_extractions"),
        ],
      )
      return
    }
    const versions = new ReportVersions(this.db, this.now),
      snapshot = await versions.snapshot(row)
    await guardedBatch(
      this.db,
      "EXISTS(SELECT 1 FROM objects WHERE id=? AND revision=? AND status='ready')",
      [id, revision],
      [
        ...snapshot.statements,
        this.db
          .prepare("UPDATE objects SET data=?,revision=? WHERE id=?")
          .bind(JSON.stringify(next), next.revision, id),
        versions.versionStatement(next, snapshot.assetId),
        ...versions.releaseStatements(next, command(raw, draft.pages).type === "approve"),
      ],
    )
  }
}
