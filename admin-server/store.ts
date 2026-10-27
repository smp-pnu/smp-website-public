import { DatabaseSync } from "node:sqlite"
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { applyCommand, checkCapacity, type Draft, type Fields, type Evidence } from "../admin-lab/model"
import { command, HttpError, idPattern } from "./validation"

export class AdminStore {
  readonly db: DatabaseSync
  readonly files: string
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700)
    this.files = path.join(root, "files"); mkdirSync(this.files, { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path.join(root, "admin.sqlite"))
    chmodSync(path.join(root, "admin.sqlite"), 0o600)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, created INTEGER NOT NULL, touched INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, bytes INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, time TEXT NOT NULL, action TEXT NOT NULL, draft TEXT);
      PRAGMA user_version=1;`)
    // A crash before the DB commit can leave a complete but unreferenced folder.
    // Only application-generated UUID folders are eligible for recovery cleanup.
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const live = new Set(this.db.prepare("SELECT id FROM drafts").all().map(row => row.id))
      for (const name of readdirSync(this.files)) if (idPattern.test(name) && !live.has(name)) rmSync(path.join(this.files, name), { recursive: true, force: true })
      this.db.exec("COMMIT")
    } catch (error) { this.db.exec("ROLLBACK"); this.db.close(); throw error }
  }
  close() { this.db.close() }
  audit(action: string, id: string | null = null) {
    this.db.prepare("INSERT INTO audit(time,action,draft) VALUES(?,?,?)").run(new Date().toISOString(), action, id)
    this.db.exec("DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 1000)")
  }
  rate(key: string, now: number, maximum: number, windowMs: number) {
    this.db.prepare("DELETE FROM rate_limits WHERE until<=?").run(now)
    const row = this.db.prepare("SELECT hits FROM rate_limits WHERE key=?").get(key)
    if (row && Number(row.hits) >= maximum) throw new HttpError(429, "요청이 많아요. 잠시 후 다시 시도해 주세요.")
    this.db.prepare("INSERT INTO rate_limits(key,hits,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1").run(key, now + windowMs)
  }
  list(): Draft[] { return this.db.prepare("SELECT data FROM drafts ORDER BY rowid DESC").all().map(row => JSON.parse(String(row.data))) }
  get(id: string): Draft {
    const row = this.db.prepare("SELECT data FROM drafts WHERE id=?").get(id)
    if (!row) throw new HttpError(404, "리포트를 찾지 못했어요.")
    return JSON.parse(String(row.data))
  }
  findHash(hash: string): Draft | undefined {
    const row = this.db.prepare("SELECT data FROM drafts WHERE hash=?").get(hash)
    return row ? JSON.parse(String(row.data)) : undefined
  }
  insert(input: { hash: string; filename: string; pages: number; fields: Fields; evidence: Evidence[]; warnings: string[]; pdf: Uint8Array; cover: Uint8Array }): Draft {
    const id = randomUUID(); const now = new Date().toISOString()
    const draft: Draft = { id, hash: input.hash, filename: input.filename, fileBytes: input.pdf.byteLength, storedBytes: input.pdf.byteLength + input.cover.byteLength,
      pages: input.pages, fields: input.fields, evidence: input.evidence, warnings: input.warnings, revision: 1, approvedRevision: null, approvedAt: null, createdAt: now, updatedAt: now, trashedAt: null }
    const folder = path.join(this.files, id)
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const duplicate = this.findHash(input.hash)
      if (duplicate) { this.db.exec("COMMIT"); return duplicate }
      try { checkCapacity(this.list(), draft.storedBytes) } catch (error) { throw new HttpError(413, (error as Error).message.replace("브라우저", "서버")) }
      mkdirSync(folder, { mode: 0o700 })
      // The folder is never publicly served. SQLite becomes the visibility boundary.
      writeFileSync(path.join(folder, "original.pdf"), input.pdf, { mode: 0o600, flush: true })
      writeFileSync(path.join(folder, "cover.webp"), input.cover, { mode: 0o600, flush: true })
      this.db.prepare("INSERT INTO drafts(id,hash,bytes,data) VALUES(?,?,?,?)").run(id, draft.hash, draft.storedBytes, JSON.stringify(draft))
      this.audit("upload", id); this.db.exec("COMMIT"); return draft
    } catch (error) { this.db.exec("ROLLBACK"); rmSync(folder, { recursive: true, force: true }); throw error }
  }
  change(id: string, revision: number, value: unknown) {
    this.db.exec("BEGIN IMMEDIATE")
    let deleted = false
    try {
      const draft = this.get(id)
      if (draft.revision !== revision) throw new HttpError(409, "다른 창에서 변경됐어요. 목록을 새로고침한 뒤 다시 확인해 주세요.")
      const change = command(value, draft.pages)
      let next: Draft | null
      try { next = applyCommand(draft, change, new Date().toISOString()) } catch (error) { throw new HttpError(400, (error as Error).message) }
      if (next) this.db.prepare("UPDATE drafts SET data=? WHERE id=?").run(JSON.stringify(next), id)
      else { this.db.prepare("DELETE FROM drafts WHERE id=?").run(id); deleted = true }
      this.audit(change.type, id); this.db.exec("COMMIT")
    } catch (error) { this.db.exec("ROLLBACK"); throw error }
    // A failed file cleanup is retried on restart; no unauthenticated route serves it.
    if (deleted) { try { rmSync(path.join(this.files, id), { recursive: true, force: true }) } catch { /* recovery at startup */ } }
  }
  asset(id: string, kind: "pdf" | "cover") {
    this.get(id)
    const file = path.join(this.files, id, kind === "pdf" ? "original.pdf" : "cover.webp")
    if (!existsSync(file)) throw new HttpError(503, "저장된 파일을 확인할 수 없어요. 서버 백업을 확인해 주세요.")
    return file
  }
}
