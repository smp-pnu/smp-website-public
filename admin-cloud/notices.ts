import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import { HttpError, bad, idPattern, object, text } from "../admin-server/validation"
import { limits, validDate } from "../admin-lab/model"
import { noticeLimits, type Notice, type NoticeBlock, type NoticeSummary } from "../admin-lab/notice-model"
import { validateCover } from "./files"
import { guardedBatch } from "./transaction"
export function noticeFields(input: unknown) {
  const v = object(input),
    title = text(v.title, 200),
    category = text(v.category, 40),
    date = text(v.date, 10)
  if (
    typeof v.pinned !== "boolean" ||
    (date && !validDate(date)) ||
    !Array.isArray(v.blocks) ||
    v.blocks.length > noticeLimits.blocks
  )
    return bad("제목·날짜·본문 형식을 확인해 주세요.")
  const blocks: NoticeBlock[] = v.blocks.map((raw) => {
    const b = object(raw),
      id = text(b.id, 36),
      type = text(b.type, 20) as NoticeBlock["type"],
      content = text(b.text, 4000)
    if (
      !idPattern.test(id) ||
      !["paragraph", "heading", "bullet", "numbered", "quote", "divider", "image"].includes(type)
    )
      return bad()
    if (type === "image" && !idPattern.test(String(b.assetId))) return bad("사진을 먼저 등록해 주세요.")
    const href = b.href ? text(b.href, 1000) : undefined
    if (href) {
      try {
        const url = new URL(href)
        if (!["https:", "mailto:"].includes(url.protocol) || url.username || url.password)
          return bad("링크는 https 또는 이메일 주소만 사용할 수 있어요.")
      } catch {
        return bad("링크 주소를 확인해 주세요.")
      }
    }
    return {
      id,
      type,
      text: content,
      ...(type === "image" ? { assetId: b.assetId as string } : {}),
      ...(href ? { href } : {}),
    }
  })
  if (
    new Set(blocks.map((b) => b.id)).size !== blocks.length ||
    blocks.reduce((n, b) => n + b.text.length, 0) > noticeLimits.characters ||
    blocks.filter((b) => b.type === "image").length > noticeLimits.images
  )
    return bad("본문은 12,000자·사진 12개까지 저장할 수 있어요.")
  return { title, category, date, pinned: v.pinned, blocks }
}
export class NoticeStore {
  constructor(
    readonly db: Database,
    readonly now = Date.now(),
  ) {}
  async get(id: string): Promise<Notice> {
    const row = await this.db
      .prepare("SELECT data FROM notices WHERE id=?")
      .bind(id)
      .first<{ data: string }>()
    if (!row) throw new HttpError(404, "공지를 찾지 못했어요.")
    return JSON.parse(row.data)
  }
  async list(): Promise<NoticeSummary[]> {
    const rows = await this.db
      .prepare(
        "SELECT json_remove(data,'$.blocks') AS summary, substr((SELECT group_concat(json_extract(value,'$.text'),' ') FROM json_each(data,'$.blocks')),1,160) AS excerpt FROM notices ORDER BY json_extract(data,'$.pinned') DESC,json_extract(data,'$.date') DESC,rowid DESC",
      )
      .all<{ summary: string; excerpt: string }>()
    return rows.results.map((r) => ({ ...JSON.parse(r.summary), excerpt: r.excerpt || "" }))
  }
  async create(input: unknown) {
    const data = noticeFields(input),
      now = new Date(this.now).toISOString()
    if (data.blocks.some((b) => b.type === "image")) bad("초안을 저장한 뒤 사진을 추가해 주세요.")
    const n: Notice = {
      ...data,
      id: crypto.randomUUID(),
      revision: 1,
      approvedRevision: null,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    }
    const saved = await this.db
      .prepare("INSERT INTO notices(id,data) SELECT ?,? WHERE (SELECT count(*) FROM notices)<? RETURNING id")
      .bind(n.id, JSON.stringify(n), noticeLimits.count)
      .first()
    if (!saved) throw new HttpError(409, "시험 공지 한도 100개에 도달했어요. 휴지통을 정리해 주세요.")
    return n
  }
  async change(id: string, input: unknown) {
    const v = object(input),
      old = await this.get(id)
    if (v.revision !== old.revision)
      throw new HttpError(409, "다른 창에서 수정한 공지예요. 목록을 새로고침해 주세요.")
    const next: Notice = {
      ...old,
      revision: old.revision + 1,
      updatedAt: new Date(this.now).toISOString(),
      approvedRevision: null,
    }
    const statements = []
    switch (v.action) {
      case "edit": {
        if (old.trashedAt) bad("휴지통에서 먼저 복원해 주세요.")
        Object.assign(next, noticeFields(v.fields))
        const ids = [...new Set(next.blocks.flatMap((b) => (b.assetId ? [b.assetId] : [])))]
        const rows = await this.db
          .prepare(
            "SELECT id FROM notice_assets WHERE notice_id=? AND id IN (SELECT value FROM json_each(?))",
          )
          .bind(id, JSON.stringify(ids))
          .all<{ id: string }>()
        if (rows.results.length !== ids.length)
          bad("사진이 만료됐거나 다른 공지의 사진입니다. 다시 추가해 주세요.")
        statements.push(
          this.db
            .prepare(
              "UPDATE notice_assets SET expires=CASE WHEN id IN (SELECT value FROM json_each(?)) THEN NULL ELSE coalesce(expires,?) END WHERE notice_id=?",
            )
            .bind(JSON.stringify(ids), this.now + 86400000, id),
        )
        break
      }
      case "approve":
        if (
          old.trashedAt ||
          !old.title ||
          !validDate(old.date) ||
          !old.blocks.some((b) => b.text || b.assetId) ||
          v.reviewed !== true
        )
          bad("제목·날짜·본문을 작성하고 미리보기를 확인해 주세요.")
        next.approvedRevision = next.revision
        break
      case "trash":
        next.trashedAt = new Date(this.now).toISOString()
        break
      case "restore":
        next.trashedAt = null
        break
      case "remove":
        if (!old.trashedAt) bad("휴지통에서만 영구 삭제할 수 있어요.")
        break
      default:
        bad()
    }
    statements.push(
      v.action === "remove"
        ? this.db.prepare("DELETE FROM notices WHERE id=?").bind(id)
        : this.db
            .prepare("UPDATE notices SET data=?,revision=? WHERE id=?")
            .bind(JSON.stringify(next), next.revision, id),
    )
    // Asset references are rechecked inside the same transaction as the update.
    const refs = next.blocks.flatMap((b) => (b.assetId ? [b.assetId] : []))
    await guardedBatch(
      this.db,
      `(SELECT revision FROM notices WHERE id=?)=? AND (?=0 OR (SELECT count(DISTINCT id) FROM notice_assets WHERE notice_id=? AND id IN (SELECT value FROM json_each(?)))=?)`,
      [id, old.revision, v.action === "edit" ? 1 : 0, id, JSON.stringify(refs), new Set(refs).size],
      statements,
    )
    return v.action === "remove" ? null : next
  }
  async image(id: string, bytes: Uint8Array) {
    const notice = await this.get(id)
    if (notice.trashedAt) bad("휴지통에서 먼저 복원해 주세요.")
    const mime = validateCover(bytes, bytes.length),
      assetId = crypto.randomUUID()
    const saved = await this.db
      .prepare(
        `INSERT INTO notice_assets(id,notice_id,bytes,mime,data,expires)
      SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM notice_assets WHERE notice_id=?)<?
      AND (SELECT coalesce(sum(pdf_bytes+cover_bytes),0) FROM objects)+(SELECT coalesce(sum(bytes),0) FROM notice_assets)+?<=?
      AND EXISTS(SELECT 1 FROM notices WHERE id=? AND json_extract(data,'$.trashedAt') IS NULL) RETURNING id`,
      )
      .bind(
        assetId,
        id,
        bytes.length,
        mime,
        Buffer.from(bytes).toString("base64"),
        this.now + 86400000,
        id,
        noticeLimits.images + 4,
        bytes.length,
        limits.totalBytes,
        id,
      )
      .first()
    if (!saved)
      throw new HttpError(
        409,
        "사진 수 또는 공유 저장 한도에 도달했어요. 사용하지 않는 사진은 24시간 뒤 정리됩니다.",
      )
    return { id: assetId }
  }
  async asset(id: string) {
    const row = await this.db
      .prepare("SELECT data,mime FROM notice_assets WHERE id=?")
      .bind(id)
      .first<{ data: string; mime: string }>()
    if (!row) throw new HttpError(404, "사진을 찾지 못했어요.")
    return new Response(new Uint8Array(Buffer.from(row.data, "base64")), {
      headers: { "Content-Type": row.mime },
    })
  }
}
