import { Buffer } from "node:buffer"
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server"
import { decodeAttestationObject } from "@simplewebauthn/server/helpers"
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server"
import { HttpError, object } from "../admin-server/validation"
import { Sessions, cookie, randomToken, secureCookie, type SessionEnv } from "./session"
import { sha256 } from "./protocol"
import { limitAuth, type AuthLimiter } from "./auth-limit"
import { StepUp, sessionBinding, securityPurpose } from "./step-up"
import { securityEventStatements } from "./security-events"

export type AuthEnv = SessionEnv & { ORIGIN: string; SETUP_TOKEN_HASH?: string; AUTH_LIMITER: AuthLimiter }
type Credential = { id: string; public_key: string; counter: number; label: string; created: number }
type Flow = { challenge: string; kind: string; authority: string; expires: number }
const flowCookie = "__Host-smp_auth_flow"
const userID = new TextEncoder().encode("smp-pdf-admin-trial")
const username = "smp-admin"
const digest = (text: string) => sha256(new TextEncoder().encode(text))
const denied = () => new HttpError(403, "인증을 확인하지 못했어요. 처음부터 다시 시도해 주세요.")
const tokenPattern = /^[a-f0-9]{64}$/
const responseJSON = (data: unknown, cookies: string[] = []) => {
  const response = Response.json(data)
  for (const value of cookies) response.headers.append("Set-Cookie", value)
  return response
}
export class Passkeys {
  readonly sessions: Sessions
  readonly rpID: string
  constructor(readonly env: AuthEnv, readonly now = Date.now()) {
    if (!tokenPattern.test(env.SESSION_SIGNING_KEY ?? "") || !tokenPattern.test(env.SETUP_TOKEN_HASH ?? "")) throw new HttpError(503, "로그인 설정을 준비 중입니다.")
    this.sessions = new Sessions(env, now); this.rpID = new URL(env.ORIGIN).hostname
  }
  private async state() { return (await this.env.ADMIN_DB.prepare("SELECT value FROM admin_config WHERE key='recovery'").first<{value: string}>())?.value ?? "" }
  private async authorize(request: Request) {
    const session = await this.sessions.identity(request)
    if (request.headers.get("x-csrf-token") !== session.csrf) throw denied()
    return session
  }
  private async flow(kind: string, authority: string, challenge: string) {
    const token = randomToken()
    await this.env.ADMIN_DB.batch([
      this.env.ADMIN_DB.prepare("DELETE FROM admin_challenges WHERE expires<=?").bind(this.now),
      this.env.ADMIN_DB.prepare("DELETE FROM usage WHERE expires<=?").bind(this.now),
      this.env.ADMIN_DB.prepare("INSERT INTO admin_challenges(hash,kind,authority,challenge,expires) VALUES(?,?,?,?,?)").bind(await digest(token), kind, authority, challenge, this.now + 5 * 60000),
    ])
    return secureCookie(flowCookie, token, 300)
  }
  private async consume(request: Request) {
    const token = cookie(request, flowCookie)
    if (!tokenPattern.test(token)) throw denied()
    const row = await this.env.ADMIN_DB.prepare("DELETE FROM admin_challenges WHERE hash=? RETURNING challenge,kind,authority,expires").bind(await digest(token)).first<Flow>()
    if (!row || row.expires <= this.now) throw denied()
    return row
  }
  private async verifyAssertion(input: unknown, challenge: string) {
    const response = input as AuthenticationResponseJSON
    if (!response || typeof response.id !== "string" || response.id.length > 1024 || response.response?.userHandle && response.response.userHandle !== Buffer.from(userID).toString("base64url")) throw denied()
    const row = await this.env.ADMIN_DB.prepare("SELECT * FROM admin_credentials WHERE id=?").bind(response.id).first<Credential>()
    if (!row) throw denied()
    let result
    try { result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: this.env.ORIGIN, expectedRPID: this.rpID, requireUserVerification: true, credential: { id: row.id, publicKey: new Uint8Array(Buffer.from(row.public_key, "base64url")), counter: row.counter } }) }
    catch { throw denied() }
    if (!result.verified) throw denied()
    const updated = await this.env.ADMIN_DB.prepare("UPDATE admin_credentials SET counter=? WHERE id=? AND counter=? RETURNING id").bind(result.authenticationInfo.newCounter, row.id, row.counter).first()
    if (!updated) throw denied()
    return row
  }
  private async complete(id: string, recoveryCode?: string) {
    const result = await this.sessions.create(username, id)
    return responseJSON({ session: result.session, ...(recoveryCode ? { recoveryCode } : {}) }, [result.cookie, secureCookie(flowCookie, "", 0)])
  }
  async handle(request: Request, body: () => Promise<unknown>): Promise<Response | null> {
    const path = new URL(request.url).pathname, method = request.method
    if (path.startsWith("/api/auth/")) await limitAuth(request, this.env.AUTH_LIMITER, this.env.SESSION_SIGNING_KEY!)
    if (path === "/api/auth/status" && method === "GET") {
      if (!this.env.SESSION_SIGNING_KEY || !this.env.SETUP_TOKEN_HASH) throw new HttpError(503, "로그인 설정을 준비 중입니다.")
      return responseJSON({ setupRequired: !await this.state() })
    }
    if (path === "/api/logout" && method === "POST") {
      await this.authorize(request)
      return responseJSON({ ok: true }, [await this.sessions.logout(request)])
    }
    if (path === "/api/auth/keys" && method === "GET") {
      await this.sessions.identity(request)
      return responseJSON((await this.env.ADMIN_DB.prepare("SELECT id,label,created FROM admin_credentials ORDER BY created").all()).results)
    }
    if (!path.startsWith("/api/auth/")) return null
    if (method !== "POST" || !["/api/auth/register/options", "/api/auth/register/verify", "/api/auth/login/options", "/api/auth/login/verify", "/api/auth/keys/remove", "/api/auth/reauth/options", "/api/auth/reauth/verify"].includes(path)) throw new HttpError(404, "요청한 기능이 없어요.")
    const data = object(await body())
    if (path === "/api/auth/reauth/options") {
      await this.authorize(request)
      const purpose = securityPurpose(data.purpose)
      const options = await generateAuthenticationOptions({ rpID: this.rpID, userVerification: "required", timeout: 60000 })
      const authority = JSON.stringify({ epoch: await this.state(), session: await sessionBinding(request), purpose })
      return responseJSON(options, [await this.flow("reauth", authority, options.challenge)])
    }
    if (path === "/api/auth/reauth/verify") {
      await this.authorize(request)
      const flow = await this.consume(request)
      if (flow.kind !== "reauth") throw denied()
      const authority = JSON.parse(flow.authority)
      if (authority.epoch !== await this.state() || authority.session !== await sessionBinding(request)) throw denied()
      await this.verifyAssertion(data.response, flow.challenge)
      const stepUpToken = await new StepUp(this.env.ADMIN_DB, this.now).grant(request, authority.epoch, authority.purpose)
      return responseJSON({ stepUpToken }, [secureCookie(flowCookie, "", 0)])
    }
    if (path === "/api/auth/register/options") {
      const state = await this.state(), mode = data.mode
      if (mode === "setup") {
        if (state || typeof data.token !== "string" || !tokenPattern.test(data.token) || await digest(data.token) !== this.env.SETUP_TOKEN_HASH) throw denied()
      } else if (mode === "recover") {
        if (!state || typeof data.token !== "string" || !tokenPattern.test(data.token) || await digest(data.token) !== state) throw denied()
      } else if (mode === "add") {
        await this.authorize(request)
        if (!state) throw denied()
        await new StepUp(this.env.ADMIN_DB, this.now).consume(request, data.stepUpToken, state, "key:add")
      }
      else throw denied()
      const existing = (await this.env.ADMIN_DB.prepare("SELECT id FROM admin_credentials").all<{id: string}>()).results ?? []
      if (mode === "add" && existing.length >= 5) throw new HttpError(409, "패스키는 최대 5개까지 등록할 수 있어요.")
      const options = await generateRegistrationOptions({ rpName: "SMP PDF 관리자 시험판", rpID: this.rpID, userName: username, userID, attestationType: "none", supportedAlgorithmIDs: [-7], timeout: 60000,
        authenticatorSelection: { residentKey: "required", userVerification: "required" }, excludeCredentials: mode === "recover" ? [] : existing.map(c => ({ id: c.id })) })
      return responseJSON(options, [await this.flow(String(mode), mode === "add" ? JSON.stringify({ epoch: state, session: await sessionBinding(request) }) : state, options.challenge)])
    }
    if (path === "/api/auth/register/verify") {
      const flow = await this.consume(request)
      if (!["setup", "recover", "add"].includes(flow.kind)) throw denied()
      if (flow.kind === "add") {
        await this.authorize(request)
        const authority = JSON.parse(flow.authority)
        if (authority.session !== await sessionBinding(request)) throw denied()
        flow.authority = authority.epoch
      }
      if (await this.state() !== flow.authority) throw denied()
      let result
      try {
        const proof = data.response as RegistrationResponseJSON
        const attestation = decodeAttestationObject(new Uint8Array(Buffer.from(proof.response.attestationObject, "base64url")))
        // This trial does not accept device certificates or contact metadata/CRL services.
        if (attestation.get("fmt") !== "none" || attestation.get("attStmt").size !== 0) throw denied()
        result = await verifyRegistrationResponse({ response: data.response as RegistrationResponseJSON, expectedChallenge: flow.challenge, expectedOrigin: this.env.ORIGIN, expectedRPID: this.rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7] }) }
      catch { throw denied() }
      if (!result.verified || !result.registrationInfo) throw denied()
      const credential = result.registrationInfo.credential
      if (credential.id.length > 1024 || credential.publicKey.length > 4096) throw denied()
      const label = typeof data.label === "string" ? data.label.trim().slice(0, 60) : "관리자 기기"
      const recoveryCode = flow.kind === "add" ? undefined : randomToken()
      const db = this.env.ADMIN_DB, id = credential.id
      // One transaction: the stored recovery epoch must still match. A second setup,
      // concurrent recovery, or stale add-key flow cannot change the winning account.
      const statements = [db.prepare("INSERT INTO admin_credentials(id,public_key,counter,label,created) SELECT ?,?,?,?,? WHERE COALESCE((SELECT value FROM admin_config WHERE key='recovery'),'')=? AND (?!='add' OR (SELECT count(*) FROM admin_credentials)<5)").bind(id, Buffer.from(credential.publicKey).toString("base64url"), credential.counter, label || "관리자 기기", this.now, flow.authority, flow.kind)]
      if (flow.kind === "recover") statements.push(
        db.prepare("DELETE FROM admin_sessions WHERE EXISTS(SELECT 1 FROM admin_credentials WHERE id=?)").bind(id),
        db.prepare("DELETE FROM admin_credentials WHERE id<>? AND EXISTS(SELECT 1 FROM admin_credentials WHERE id=?)").bind(id, id),
      )
      if (recoveryCode) statements.push(db.prepare("INSERT INTO admin_config(key,value) SELECT 'recovery',? WHERE EXISTS(SELECT 1 FROM admin_credentials WHERE id=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await digest(recoveryCode), id))
      statements.push(...securityEventStatements(db, this.now, flow.kind === "add" ? "key:add" : flow.kind === "recover" ? "account:recover" : "account:setup", id))
      try { await db.batch(statements) } catch { throw denied() }
      if (!await db.prepare("SELECT id FROM admin_credentials WHERE id=?").bind(id).first()) throw denied()
      return this.complete(id, recoveryCode)
    }
    if (path === "/api/auth/login/options") {
      if (!await this.state()) throw denied()
      const options = await generateAuthenticationOptions({ rpID: this.rpID, userVerification: "required", timeout: 60000 })
      return responseJSON(options, [await this.flow("login", await this.state(), options.challenge)])
    }
    if (path === "/api/auth/login/verify") {
      const flow = await this.consume(request)
      if (flow.kind !== "login" || flow.authority !== await this.state()) throw denied()
      const row = await this.verifyAssertion(data.response, flow.challenge)
      return this.complete(row.id)
    }
    await this.authorize(request)
    if (typeof data.id !== "string" || data.id.length > 1024) throw denied()
    await new StepUp(this.env.ADMIN_DB, this.now).consume(request, data.stepUpToken, await this.state(), securityPurpose(`key:remove:${data.id}`))
    const db = this.env.ADMIN_DB, check = randomToken()
    try { await db.batch([
      db.prepare("INSERT INTO mutation_checks(token,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM admin_credentials WHERE id=?) AND (SELECT count(*) FROM admin_credentials)>1 THEN 1 ELSE 0 END)").bind(check,data.id),
      db.prepare("DELETE FROM admin_credentials WHERE id=?").bind(data.id),
      db.prepare("DELETE FROM admin_sessions WHERE subject=?").bind(data.id),
      ...securityEventStatements(db,this.now,"key:remove"),
      db.prepare("DELETE FROM mutation_checks WHERE token=?").bind(check),
    ]) } catch { throw new HttpError(409, "마지막 패스키이거나 키 목록이 바뀌었어요. 목록을 새로 확인해 주세요.") }
    return responseJSON({ ok: true })
  }
}
