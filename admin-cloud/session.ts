import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import { HttpError } from "../admin-server/validation"
import { sha256 } from "./protocol"

export type SessionEnv = { ADMIN_DB: Database; SESSION_SIGNING_KEY?: string }
type Row = { hash: string; username: string; subject: string; expires: number; idle_expires: number }
export const cookieName = "__Host-smp_admin"
const idle = 30 * 60_000, lifetime = 8 * 60 * 60_000
const validToken = /^[a-f0-9]{64}\.[a-f0-9]{64}$/
export const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
export function cookie(request: Request, name: string) {
  const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${name}=`))
  return values.length === 1 ? values[0].slice(name.length + 1) : ""
}
export function secureCookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`
}
async function sign(key: string | undefined, value: string) {
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new HttpError(503, "시험 사이트의 로그인 설정을 준비 중입니다.")
  const cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(Buffer.from(key, "hex")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return Buffer.from(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value))).toString("hex")
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
export class Sessions {
  constructor(readonly env: SessionEnv, readonly now = Date.now()) {}
  async create(username: string, subject: string) {
    const id = randomToken(), hash = await sha256(new TextEncoder().encode(id))
    const signed = `${id}.${await sign(this.env.SESSION_SIGNING_KEY, `session:${id}`)}`
    await this.env.ADMIN_DB.batch([
      this.env.ADMIN_DB.prepare("DELETE FROM admin_sessions WHERE expires<=? OR idle_expires<=?").bind(this.now, this.now),
      this.env.ADMIN_DB.prepare("DELETE FROM admin_sessions WHERE hash IN (SELECT hash FROM admin_sessions ORDER BY expires DESC LIMIT -1 OFFSET 4)"),
      this.env.ADMIN_DB.prepare("INSERT INTO admin_sessions(hash,username,subject,expires,idle_expires) VALUES(?,?,?,?,?)").bind(hash, username, subject, this.now + lifetime, this.now + idle),
    ])
    return { cookie: secureCookie(cookieName, signed, lifetime / 1000), session: { username, csrf: await sign(this.env.SESSION_SIGNING_KEY, `csrf:${id}`) } }
  }
  async identity(request: Request, refresh = true) {
    if (!this.env.SESSION_SIGNING_KEY) throw new HttpError(503, "시험 사이트의 로그인 설정을 준비 중입니다.")
    const token = cookie(request, cookieName)
    if (!validToken.test(token)) throw new HttpError(401, "관리자 로그인이 필요합니다.")
    const [id, signature] = token.split(".")
    if (!equal(signature, await sign(this.env.SESSION_SIGNING_KEY, `session:${id}`))) throw new HttpError(401, "로그인 인증을 확인하지 못했어요.")
    const hash = await sha256(new TextEncoder().encode(id))
    const row = await this.env.ADMIN_DB.prepare("SELECT * FROM admin_sessions WHERE hash=? AND EXISTS(SELECT 1 FROM admin_credentials WHERE id=admin_sessions.subject)").bind(hash).first<Row>()
    if (!row || row.expires <= this.now || row.idle_expires <= this.now) throw new HttpError(401, "로그인이 만료됐어요. 다시 로그인해 주세요.")
    if (refresh && row.idle_expires < this.now + idle - 5 * 60_000) await this.env.ADMIN_DB.prepare("UPDATE admin_sessions SET idle_expires=min(expires,?) WHERE hash=? AND idle_expires>?").bind(this.now + idle, hash, this.now).run()
    return { username: row.username, csrf: await sign(this.env.SESSION_SIGNING_KEY, `csrf:${id}`) }
  }
  async logout(request: Request) {
    await this.identity(request, false)
    const hash = await sha256(new TextEncoder().encode(cookie(request, cookieName).split(".")[0]))
    await this.env.ADMIN_DB.prepare("DELETE FROM admin_sessions WHERE hash=?").bind(hash).run()
    return secureCookie(cookieName, "", 0)
  }
}
