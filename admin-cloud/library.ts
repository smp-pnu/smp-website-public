import type { Database } from "../cloudflare/bindings"
import type { Draft } from "../admin-lab/model"
import type { LibraryOrder } from "../admin-lab/library-model"
import { applyCommand } from "../admin-lab/model"
import { bad, HttpError, idPattern, object, text } from "../admin-server/validation"
import { guardedBatch } from "./transaction"

export class LibraryStore {
  constructor(
    readonly db: Database,
    readonly now = Date.now(),
  ) {}
  async order(): Promise<LibraryOrder> {
    const row = await this.db
      .prepare("SELECT revision,ids FROM library_order WHERE kind='reports'")
      .first<{ revision: number; ids: string }>()
    const active = (
      await this.db
        .prepare(
          "SELECT id FROM objects WHERE status='ready' AND json_extract(data,'$.trashedAt') IS NULL ORDER BY json_extract(data,'$.fields.date') DESC,id",
        )
        .all<{ id: string }>()
    ).results.map((r) => r.id)
    const stored = (JSON.parse(row?.ids ?? "[]") as string[]).filter((id) => active.includes(id))
    return { revision: row?.revision ?? 1, ids: [...active.filter((id) => !stored.includes(id)), ...stored] }
  }
  async reorder(input: unknown) {
    const value = object(input),
      ids = value.ids
    if (
      !Number.isInteger(value.revision) ||
      !Array.isArray(ids) ||
      ids.length > 50 ||
      ids.some((id) => typeof id !== "string" || !idPattern.test(id)) ||
      new Set(ids).size !== ids.length
    )
      return bad()
    const all = await this.order()
    if (all.ids.length !== ids.length || all.ids.some((id) => !ids.includes(id)))
      throw new HttpError(409, "목록이 달라졌어요. 새로고침 후 순서를 변경해 주세요.")
    const encoded = JSON.stringify(ids)
    await guardedBatch(
      this.db,
      `(SELECT revision FROM library_order WHERE kind='reports')=? AND
      (SELECT count(*) FROM objects WHERE status='ready' AND json_extract(data,'$.trashedAt') IS NULL)=? AND
      (SELECT count(*) FROM objects WHERE status='ready' AND json_extract(data,'$.trashedAt') IS NULL AND id IN (SELECT value FROM json_each(?)))=?`,
      [value.revision, ids.length, encoded, ids.length],
      [
        this.db
          .prepare("UPDATE library_order SET ids=?,revision=revision+1 WHERE kind='reports'")
          .bind(encoded),
      ],
    )
    return this.order()
  }
  async batch(input: unknown) {
    const value = object(input),
      items = value.items,
      action = object(value.action)
    if (!Array.isArray(items) || !items.length || items.length > 20)
      return bad("한 번에 20개까지 처리할 수 있어요.")
    const expected = items.map((item) => {
      const v = object(item)
      if (!idPattern.test(String(v.id)) || !Number.isInteger(v.revision) || Number(v.revision) < 1) bad()
      return { id: v.id as string, revision: v.revision as number }
    })
    if (new Set(expected.map((v) => v.id)).size !== expected.length) bad()
    if (!["trash", "restore", "remove", "classify"].includes(String(action.type))) bad()
    const field = text(action.field ?? "", 20),
      label = text(action.value ?? "", 100)
    if (
      action.type === "classify" &&
      (!["semester", "author", "industry"].includes(field) ||
        (field === "semester" && label && !/^20\d{2}-[12]$/.test(label)))
    )
      bad("학기는 2026-2 형식으로 입력해 주세요.")
    const rows = (
      await this.db
        .prepare(
          "SELECT id,revision,data FROM objects WHERE status='ready' AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))",
        )
        .bind(JSON.stringify(expected))
        .all<{ id: string; revision: number; data: string }>()
    ).results
    if (
      rows.length !== expected.length ||
      rows.some((row) => expected.find((v) => v.id === row.id)?.revision !== row.revision)
    )
      throw new HttpError(409, "선택한 자료가 변경됐어요. 새로고침해 주세요.")
    const statements = rows.map((row) => {
      const draft: Draft = JSON.parse(row.data)
      if (action.type === "remove") {
        if (!draft.trashedAt) bad("영구 삭제는 휴지통에서만 가능합니다.")
        return this.db.prepare("DELETE FROM objects WHERE id=?").bind(row.id)
      }
      if (action.type === "classify" && draft.trashedAt) bad("휴지통 자료는 먼저 복원해 주세요.")
      const next = applyCommand(
        draft,
        action.type === "classify"
          ? { type: "edit", fields: { ...draft.fields, [field]: label } }
          : { type: "trash", trashed: action.type === "trash" },
        new Date(this.now).toISOString(),
      )!
      next.revision = row.revision + 1
      next.updatedAt = new Date(this.now).toISOString()
      next.approvedRevision = null
      next.approvedAt = null
      return this.db
        .prepare("UPDATE objects SET data=?,revision=? WHERE id=?")
        .bind(JSON.stringify(next), next.revision, row.id)
    })
    if (action.type === "remove") statements.push(this.db.prepare("DELETE FROM metadata_extractions"))
    await guardedBatch(
      this.db,
      `(SELECT count(*) FROM objects o JOIN json_each(?) e ON o.id=json_extract(e.value,'$.id') AND o.revision=json_extract(e.value,'$.revision') WHERE o.status='ready')=?`,
      [JSON.stringify(expected), expected.length],
      statements,
    )
    return { changed: expected.length }
  }
}
