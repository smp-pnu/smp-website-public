import type { Database } from "../cloudflare/bindings"
import type { LibraryOrder } from "../admin-lab/library-model"
import { bad, HttpError, idPattern, object } from "../admin-server/validation"
import { guardedBatch } from "./transaction"

const sources = {
  reports: {
    from: "objects WHERE status='ready' AND json_extract(data,'$.trashedAt') IS NULL",
    sorting: "json_extract(data,'$.fields.date') DESC,id",
    pinned: "0",
    limit: 500,
  },
  notices: {
    from: "notices WHERE json_extract(data,'$.trashedAt') IS NULL",
    sorting: "json_extract(data,'$.pinned') DESC,json_extract(data,'$.date') DESC,rowid DESC",
    pinned: "json_extract(data,'$.pinned')",
    limit: 100,
  },
} as const
type ActiveItem = { id: string; pinned: number }

// Both libraries share revision checks and full-list validation. SQL fragments
// come exclusively from the closed source map, never from request data.
export class ContentOrderStore {
  constructor(readonly db: Database, readonly kind: keyof typeof sources) {}
  private async snapshot() {
    const source = sources[this.kind]
    const row = await this.db.prepare("SELECT revision,ids FROM library_order WHERE kind=?")
      .bind(this.kind).first<{ revision: number; ids: string }>()
    const active = (await this.db.prepare(`SELECT id,${source.pinned} AS pinned FROM ${source.from} ORDER BY ${source.sorting}`)
      .all<ActiveItem>()).results
    const present = new Map(active.map((item) => [item.id, item]))
    const stored = (JSON.parse(row?.ids ?? "[]") as string[]).filter((id) => present.has(id))
    const known = new Set(stored)
    const ids = [...active.filter((item) => !known.has(item.id)).map((item) => item.id), ...stored]
    // A newly pinned notice moves into the pinned group without changing the
    // relative order of the other notices. New drafts lead their own group.
    ids.sort((a, b) => Number(present.get(b)!.pinned) - Number(present.get(a)!.pinned))
    return { active, order: { revision: row?.revision ?? 1, ids } }
  }
  async order(): Promise<LibraryOrder> { return (await this.snapshot()).order }
  async reorder(input: unknown) {
    const value = object(input), ids = value.ids, source = sources[this.kind]
    if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !Array.isArray(ids)
      || ids.length > source.limit || ids.some((id) => typeof id !== "string" || !idPattern.test(id))
      || new Set(ids).size !== ids.length) return bad()
    const { active, order } = await this.snapshot()
    if (order.ids.length !== ids.length || order.ids.some((id) => !ids.includes(id)))
      throw new HttpError(409, "목록이 달라졌어요. 새로고침 후 순서를 변경해 주세요.")
    const pinned = new Set(active.filter((item) => item.pinned).map((item) => item.id))
    if (ids.some((id, index) => pinned.has(id) !== (index < pinned.size)))
      throw new HttpError(409, "고정 공지는 위에 유지됩니다. 같은 그룹 안에서 순서를 변경해 주세요.")
    const encoded = JSON.stringify(ids)
    const pinGuard = this.kind === "notices" ? ` AND
      (SELECT count(*) FROM ${source.from} AND ${source.pinned}=1)=? AND
      (SELECT count(*) FROM ${source.from} AND ${source.pinned}=1 AND id IN (SELECT value FROM json_each(?)))=?` : ""
    await guardedBatch(this.db,
      `(SELECT revision FROM library_order WHERE kind=?)=? AND
      (SELECT count(*) FROM ${source.from})=? AND
      (SELECT count(*) FROM ${source.from} AND id IN (SELECT value FROM json_each(?)))=?${pinGuard}`,
      [this.kind, value.revision, ids.length, encoded, ids.length,
        ...(this.kind === "notices" ? [pinned.size, JSON.stringify([...pinned]), pinned.size] : [])],
      [this.db.prepare("UPDATE library_order SET ids=?,revision=revision+1 WHERE kind=?").bind(encoded, this.kind)],
    )
    return this.order()
  }
}
