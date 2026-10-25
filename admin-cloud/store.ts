import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import { applyCommand, limits, type Draft } from "../admin-lab/model"
import { HttpError, bad, command, evidence, fields, object, text, warnings } from "../admin-server/validation"
import { chunkBytes, coverLimit, manifestHash } from "./protocol"
export type ObjectRow = { id: string; hash: string; status: "staging" | "ready"; owner: string; pdf_bytes: number; cover_bytes: number; revision: number; expires: number | null; data: string }
export type ChunkRow = { part: number; bytes: number; hash: string; data: string }
export class CloudStore {
  constructor(readonly db: Database, readonly now = Date.now()) {}
  async cleanup() { await this.db.prepare("DELETE FROM usage WHERE expires<?").bind(this.now).run() }
  async budget() {
    const day = Math.floor(this.now / 86_400_000), minute = Math.floor(this.now / 60_000)
    // Bounded atomic counters. Only Access-authenticated requests reach D1.
    for (const [key, max, expires] of [[`day:${day}`, 5000, (day + 1) * 86_400_000], [`minute:${minute}`, 600, (minute + 1) * 60_000]] as const) {
      const accepted = await this.db.prepare("INSERT INTO usage(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits").bind(key, expires, max).first()
      if (!accepted) throw new HttpError(429, "무료 시험 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.")
    }
  }
  async get(id: string, ready = true) {
    const row = await this.db.prepare("SELECT * FROM objects WHERE id=?").bind(id).first<ObjectRow>()
    if (!row || (ready && row.status !== "ready")) throw new HttpError(404, "리포트를 찾지 못했어요.")
    return row
  }
  async list(): Promise<Draft[]> {
    const { results } = await this.db.prepare("SELECT data FROM objects WHERE status='ready' ORDER BY rowid DESC").all<{ data: string }>()
    return results.map(row => JSON.parse(row.data))
  }
  async begin(input: unknown, owner: string) {
    const value = object(input), filename = text(value.filename, 180), hash = text(value.hash, 64)
    if (!/^[a-f0-9]{64}$/.test(hash) || !/\.pdf$/i.test(filename) || /[\\/\r\n]/.test(filename)) bad("파일 정보를 확인해 주세요.")
    const bytes = Number(value.fileBytes), cover = Number(value.coverBytes), pages = Number(value.pages)
    if (!Number.isSafeInteger(bytes) || bytes < 8 || bytes > limits.fileBytes || !Number.isSafeInteger(cover) || cover < 12 || cover > coverLimit
      || !Number.isSafeInteger(pages) || pages < 1 || pages > limits.pages) bad("파일 크기와 페이지 수를 확인해 주세요.")
    const now = new Date(this.now).toISOString()
    const draft: Draft = { id: crypto.randomUUID(), hash, filename, fileBytes: bytes, storedBytes: bytes + cover, pages,
      fields: fields(value.fields), evidence: evidence(value.evidence, pages), warnings: warnings(value.warnings), revision: 1,
      approvedRevision: null, approvedAt: null, updatedAt: now, createdAt: now, trashedAt: null }
    await this.db.batch([
      this.db.prepare("DELETE FROM objects WHERE status='staging' AND expires<?").bind(this.now),
      this.db.prepare("DELETE FROM usage WHERE expires<?").bind(this.now),
      this.db.prepare(`INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,expires,data)
        SELECT ?,?,'staging',?,?,?,?,? WHERE (SELECT count(*) FROM objects)<?
        AND (SELECT coalesce(sum(pdf_bytes+cover_bytes),0) FROM objects)+?<=?
        AND NOT EXISTS(SELECT 1 FROM objects WHERE status='staging') ON CONFLICT(hash) DO NOTHING`)
        .bind(draft.id, hash, owner, bytes, cover, this.now + 30 * 60_000, JSON.stringify(draft), limits.drafts, bytes + cover, limits.totalBytes),
    ])
    const row = await this.db.prepare("SELECT * FROM objects WHERE hash=?").bind(hash).first<ObjectRow>()
    if (!row) throw new HttpError(409, "다른 업로드가 진행 중이거나 시험 저장 한도(50개·200MB)에 도달했어요. 중단된 업로드는 30분 뒤 자동 정리돼요.")
    if (row.owner !== owner || row.pdf_bytes !== bytes) throw new HttpError(409, "기존 업로드 정보를 확인해 주세요.")
    return row.status === "ready" ? { draft: JSON.parse(row.data) as Draft } : { id: row.id }
  }
  async stage(id: string, owner: string) {
    const row = await this.get(id, false)
    if (row.owner !== owner || row.status !== "staging" || !row.expires || row.expires <= this.now) throw new HttpError(409, "업로드가 만료됐거나 이미 완료됐어요. 다시 선택해 주세요.")
    return row
  }
  async put(row: ObjectRow, kind: "pdf" | "cover", part: number, data: string, bytes: number, hash: string) {
    const previous = await this.db.prepare("SELECT hash FROM chunks WHERE object_id=? AND kind=? AND part=?").bind(row.id, kind, part).first<{hash: string}>()
    if (previous && previous.hash !== hash) throw new HttpError(409, "같은 업로드의 파일 내용이 달라졌어요.")
    await this.db.prepare(`INSERT INTO chunks(object_id,kind,part,bytes,hash,data)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM objects WHERE id=? AND status='staging' AND expires>?)
      ON CONFLICT(object_id,kind,part) DO NOTHING`).bind(row.id, kind, part, bytes, hash, data, row.id, this.now).run()
  }
  async parts(id: string, kind: string, withData = false) {
    return (await this.db.prepare(`SELECT part,bytes,hash${withData ? ",data" : ""} FROM chunks WHERE object_id=? AND kind=? ORDER BY part`).bind(id, kind).all<ChunkRow>()).results
  }
  async finish(id: string, owner: string) {
    const existing = await this.get(id, false)
    if (existing.status === "ready" && existing.owner === owner) return JSON.parse(existing.data) as Draft
    const row = await this.stage(id, owner)
    const pdf = await this.parts(id, "pdf"), cover = await this.parts(id, "cover")
    for (const [parts, total] of [[pdf, row.pdf_bytes], [cover, row.cover_bytes]] as const) {
      if (parts.length !== Math.ceil(total / chunkBytes) || parts.some((p, i) => p.part !== i || p.bytes !== Math.min(chunkBytes, total - i * chunkBytes))) throw new HttpError(409, "파일 전송이 아직 끝나지 않았어요. 다시 선택하면 이어서 처리해요.")
    }
    if (await manifestHash(pdf) !== row.hash) throw new HttpError(400, "PDF 전송 검증에 실패했어요. 원본을 다시 선택해 주세요.")
    // Read only the ends of the last two chunks: %%EOF may straddle their boundary.
    const tails = await this.db.prepare("SELECT substr(data,-2732) AS data FROM chunks WHERE object_id=? AND kind='pdf' AND part>=? ORDER BY part").bind(id, Math.max(0, pdf.length - 2)).all<{data: string}>()
    const tail = Buffer.concat(tails.results.map(p => Buffer.from(p.data, "base64"))).subarray(-2048).toString("latin1")
    if (!tail.includes("%%EOF")) throw new HttpError(400, "PDF 끝부분을 확인하지 못했어요. 완전한 원본을 선택해 주세요.")
    const saved = await this.db.prepare("UPDATE objects SET status='ready',expires=NULL WHERE id=? AND status='staging' AND expires>? RETURNING data").bind(id, this.now).first<{data: string}>()
    if (!saved) throw new HttpError(409, "업로드가 만료됐어요. 다시 선택해 주세요.")
    return JSON.parse(saved.data) as Draft
  }
  async cancel(id: string, owner: string) {
    await this.db.prepare("DELETE FROM objects WHERE id=? AND status='staging' AND owner=?").bind(id, owner).run()
  }
  async change(id: string, revision: number, raw: unknown) {
    const row = await this.get(id), draft = JSON.parse(row.data) as Draft
    if (row.revision !== revision) throw new HttpError(409, "다른 창에서 변경됐어요. 목록을 새로고침해 주세요.")
    let next: Draft | null
    try { next = applyCommand(draft, command(raw, draft.pages), new Date(this.now).toISOString()) } catch (e) { throw new HttpError(400, (e as Error).message) }
    // Every command advances the DB revision, including approval, to prevent lost updates.
    if (next) {
      next.revision = revision + 1
      if (next.approvedRevision !== null) next.approvedRevision = next.revision
    }
    const changed = next
      ? await this.db.prepare("UPDATE objects SET data=?,revision=? WHERE id=? AND revision=? AND status='ready' RETURNING id").bind(JSON.stringify(next), next.revision, id, revision).first()
      : await this.db.prepare("DELETE FROM objects WHERE id=? AND revision=? AND status='ready' RETURNING id").bind(id, revision).first()
    if (!changed) throw new HttpError(409, "다른 창에서 변경됐어요. 목록을 새로고침해 주세요.")
  }
}
