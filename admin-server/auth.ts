import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { AdminStore } from "./store"
import { HttpError, object, text } from "./validation"
const IDLE = 30 * 60_000, ABSOLUTE = 8 * 60 * 60_000
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const token = () => randomBytes(32).toString("base64url")
const equal = (a: string, b: string) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right) }
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
export class Auth {
  private busy = false
  private setupKey = ""
  private readonly keyPath: string
  private readonly cookieName: string
  constructor(readonly store: AdminStore, readonly now: () => number = Date.now, port = "3013") {
    this.cookieName = `smp_admin_trial_${port}`
    this.keyPath = path.join(store.root, "setup-key.txt")
    if (!this.admin()) {
      this.setupKey = existsSync(this.keyPath) ? readFileSync(this.keyPath, "utf8").trim() : token()
      if (!/^[A-Za-z0-9_-]{43}$/.test(this.setupKey)) throw Error("Invalid local setup key")
      writeFileSync(this.keyPath, this.setupKey + "\n", { mode: 0o600 }); chmodSync(this.keyPath, 0o600)
    } else rmSync(this.keyPath, { force: true })
  }
  admin() { return this.store.db.prepare("SELECT username,password FROM admins WHERE id=1").get() as { username: string; password: string } | undefined }
  private start() {
    if (this.busy) throw new HttpError(429, "로그인을 처리 중이에요. 잠시 후 시도해 주세요.")
    this.store.rate("login", this.now(), 10, 15 * 60_000)
    this.busy = true
  }
  async setup(input: unknown) {
    const data = object(input)
    if (this.admin()) throw new HttpError(409, "관리자 설정이 이미 완료됐어요. 로그인해 주세요.")
    this.start()
    try {
      if (!equal(hash(text(data.setupKey, 100)), hash(this.setupKey))) throw new HttpError(403, "초기 설정 키가 맞지 않아요.")
      const username = text(data.username, 64).toLowerCase()
      const password = typeof data.password === "string" ? data.password : ""
      if (!/^[a-z0-9][a-z0-9._@-]{2,63}$/.test(username) || password.length < 10 || password.length > 128) throw new HttpError(400, "아이디는 영문·숫자 3~64자, 비밀번호는 10~128자로 입력해 주세요.")
      const salt = token(), key = await derive(password, salt)
      this.store.db.prepare("INSERT INTO admins(id,username,password) VALUES(1,?,?)").run(username, `${salt}:${key.toString("hex")}`)
      this.setupKey = ""; rmSync(this.keyPath, { force: true }); this.store.audit("setup")
      return this.issue(username)
    } finally { this.busy = false }
  }
  async login(input: unknown) {
    const data = object(input); const username = text(data.username, 64).toLowerCase()
    const password = typeof data.password === "string" ? data.password : ""
    if (password.length > 128) throw new HttpError(400, "아이디 또는 비밀번호를 확인해 주세요.")
    this.start()
    try {
      const admin = this.admin()
      const [salt, stored] = admin?.password.split(":") ?? ["invalid-account-dummy-salt", "0".repeat(128)]
      const key = await derive(password, salt)
      if (!admin || !equal(key.toString("hex"), stored) || admin.username !== username) throw new HttpError(401, "아이디 또는 비밀번호를 확인해 주세요.")
      this.store.audit("login"); return this.issue(admin.username)
    } finally { this.busy = false }
  }
  private issue(username: string) {
    const raw = token(), now = this.now()
    this.store.db.prepare("DELETE FROM sessions WHERE created<=? OR touched<=?").run(now - ABSOLUTE, now - IDLE)
    // One semester administrator; keep at most five concurrent sessions.
    this.store.db.exec("DELETE FROM sessions WHERE hash NOT IN (SELECT hash FROM sessions ORDER BY created DESC LIMIT 4)")
    this.store.db.prepare("INSERT INTO sessions(hash,created,touched) VALUES(?,?,?)").run(hash(raw), now, now)
    return { session: { username, csrf: hash(`csrf:${raw}`) }, cookie: `${this.cookieName}=${raw}; HttpOnly; SameSite=Strict; Path=/api` }
  }
  session(request: Request, required = true) {
    const raw = request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${this.cookieName}=`))?.slice(this.cookieName.length + 1) ?? ""
    const key = hash(raw), now = this.now()
    const row = /^[A-Za-z0-9_-]{43}$/.test(raw) ? this.store.db.prepare("SELECT created,touched FROM sessions WHERE hash=?").get(key) : undefined
    if (!row || Number(row.created) <= now - ABSOLUTE || Number(row.touched) <= now - IDLE) {
      if (row) this.store.db.prepare("DELETE FROM sessions WHERE hash=?").run(key)
      if (required) throw new HttpError(401, "로그인이 필요하거나 세션이 만료됐어요.")
      return null
    }
    if (now - Number(row.touched) > 60_000) this.store.db.prepare("UPDATE sessions SET touched=? WHERE hash=?").run(now, key)
    return { username: this.admin()!.username, csrf: hash(`csrf:${raw}`), key }
  }
  verifyCsrf(request: Request) {
    const session = this.session(request)!
    if (!equal(request.headers.get("x-csrf-token") ?? "", session.csrf)) throw new HttpError(403, "요청 인증이 만료됐어요. 화면을 새로고침해 주세요.")
    return session
  }
  logout(request: Request) {
    const session = this.verifyCsrf(request)
    this.store.db.prepare("DELETE FROM sessions WHERE hash=?").run(session.key); this.store.audit("logout")
    return `${this.cookieName}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`
  }
}
