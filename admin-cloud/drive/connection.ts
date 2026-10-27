import { Buffer } from "node:buffer"
import type { Database } from "../../cloudflare/bindings"
import { HttpError, object, text } from "../../admin-server/validation"
import { randomToken } from "../session"
import { securityEventStatements } from "../security-events"
import { sha256 } from "../protocol"
export type DriveEnv = {
  ADMIN_DB: Database
  SESSION_SIGNING_KEY?: string
  ORIGIN: string
  DRIVE_ACCOUNT_EMAIL?: string
}
export type DriveFetch = (input: string, init?: RequestInit) => Promise<Response>
type Client = { clientId: string; clientSecret: string; namespace: string }
type Grant = {
  refreshToken: string
  accessToken: string
  expires: number
  email: string
  folderId?: string
  folderName?: string
}
export const driveScope = "https://www.googleapis.com/auth/drive.file"
const apiRoot = "https://www.googleapis.com/drive/v3"
const folderName = "SMP 관리자 시험 · PDF 원본"
export const validFileId = (id: string) => /^[\w-]{10,200}$/.test(id)
const transientError = () =>
  new HttpError(
    503,
    "Drive 연결을 확인하지 못했어요. 잠시 후 다시 시도하거나 저장소 설정에서 다시 연결해 주세요.",
  )

// Purpose- and origin-bound encryption; neither Google credentials nor resumable
// upload capabilities leave the server. Keep this key when restoring the DB.
export class StorageVault {
  constructor(readonly env: DriveEnv) {}
  private async key() {
    if (!this.env.SESSION_SIGNING_KEY || !/^[a-f0-9]{64}$/.test(this.env.SESSION_SIGNING_KEY))
      throw transientError()
    const material = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(Buffer.from(this.env.SESSION_SIGNING_KEY, "hex")),
      "HKDF",
      false,
      ["deriveKey"],
    )
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode(this.env.ORIGIN),
        info: new TextEncoder().encode("smp-drive-secrets-v1"),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )
  }
  async seal(value: unknown, purpose: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(purpose) },
      await this.key(),
      new TextEncoder().encode(JSON.stringify(value)),
    )
    return Buffer.concat([iv, Buffer.from(data)]).toString("base64")
  }
  async open<T>(encrypted: string, purpose: string): Promise<T> {
    try {
      const data = new Uint8Array(Buffer.from(encrypted, "base64"))
      const plain = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: data.slice(0, 12),
          additionalData: new TextEncoder().encode(purpose),
        },
        await this.key(),
        data.slice(12),
      )
      return JSON.parse(new TextDecoder().decode(plain))
    } catch {
      throw transientError()
    }
  }
  async get<T>(key: string) {
    const row = await this.env.ADMIN_DB.prepare("SELECT encrypted FROM storage_secrets WHERE key=?")
      .bind(key)
      .first<{ encrypted: string }>()
    return row ? this.open<T>(row.encrypted, key) : null
  }
  async set(key: string, value: unknown) {
    await this.env.ADMIN_DB.prepare(
      "INSERT INTO storage_secrets(key,encrypted) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET encrypted=excluded.encrypted",
    )
      .bind(key, await this.seal(value, key))
      .run()
  }
}

export class DriveConnection {
  readonly vault: StorageVault
  private cachedToken: string | null = null
  constructor(
    readonly env: DriveEnv,
    readonly now = Date.now(),
    readonly fetcher: DriveFetch = fetch,
  ) {
    this.vault = new StorageVault(env)
  }
  async fetch(url: string, init: RequestInit = {}) {
    try {
      // workerd's global fetch rejects a class instance as its `this` value.
      // Keep the injected function unbound, as it is when called globally.
      const fetcher = this.fetcher
      const response = await fetcher(url, {
        ...init,
        // workerd does not implement redirect:"error". Never follow Google
        // redirects with credentials: inspect and reject them ourselves.
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      })
      // Drive also uses 308 without Location as a resumable-upload acknowledgement.
      const resumeAcknowledgement = response.status === 308 && !response.headers.has("location")
      if (response.status >= 300 && response.status < 400 && !resumeAcknowledgement) {
        await response.body?.cancel()
        throw transientError()
      }
      return response
    } catch {
      throw transientError()
    }
  }
  async json<T>(response: Response, stage?: "인증 교환" | "계정 확인"): Promise<T> {
    if (!response.ok) {
      await response.body?.cancel()
      // Only expose our fixed stage and HTTP status, never upstream error bodies,
      // which can contain OAuth codes or other private request values.
      if (stage)
        throw new HttpError(
          503,
          `Google ${stage}에 실패했어요 (HTTP ${response.status}). 저장소 메뉴에서 다시 연결해 주세요.`,
        )
      throw transientError()
    }
    const reader = response.body?.getReader()
    if (!reader) throw transientError()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const value = await reader.read()
        if (value.done) break
        length += value.value.length
        if (length > 128 * 1024) {
          await reader.cancel()
          throw transientError()
        }
        chunks.push(value.value)
      }
    } finally {
      reader.releaseLock()
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString())
    } catch {
      throw transientError()
    }
  }
  private parseClient(input: unknown) {
    const raw = object(input),
      web = object(raw.web)
    const clientId = text(web.client_id, 200),
      clientSecret = text(web.client_secret, 256)
    if (
      !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
      clientSecret.length < 12 ||
      !Array.isArray(web.redirect_uris) ||
      !web.redirect_uris.includes(this.env.ORIGIN + "/api/storage/drive/callback")
    )
      throw new HttpError(
        400,
        "이 관리자 주소의 콜백이 등록된 웹 애플리케이션 OAuth JSON을 선택해 주세요.",
      )
    return { clientId, clientSecret }
  }
  async configured() {
    return !!(this.env.DRIVE_ACCOUNT_EMAIL && (await this.vault.get<Client>("drive-client")))
  }
  async grant() {
    return this.vault.get<Grant>("drive-grant")
  }
  async status(owner: string) {
    const client = await this.vault.get<Client>("drive-client"),
      grant = await this.grant()
    const pending = await this.env.ADMIN_DB.prepare(
      "SELECT 1 AS ready FROM drive_oauth WHERE owner=? AND pending_secret IS NOT NULL AND pending_secret NOT IN ('processing','confirming') AND expires>? LIMIT 1",
    )
      .bind(owner, this.now)
      .first()
    return {
      configured: !!client,
      accountConfigured: !!this.env.DRIVE_ACCOUNT_EMAIL,
      connected: !!grant?.folderId,
      email: grant?.email ?? this.env.DRIVE_ACCOUNT_EMAIL ?? null,
      folderName: grant?.folderName ?? null,
      pending: !!pending,
      backend: grant?.folderId ? "drive" : "d1",
      fileLimit: 32 * 1024 * 1024,
      reportLimit: grant?.folderId ? 500 : 50,
    }
  }
  async configure(input: unknown) {
    if (!this.env.DRIVE_ACCOUNT_EMAIL)
      throw new HttpError(409, "서버의 학회 Drive 계정 설정이 먼저 필요합니다.")
    const { clientId, clientSecret } = this.parseClient(input)
    const prior = await this.vault.get<Client>("drive-client")
    if (prior && (prior.clientId !== clientId || prior.clientSecret !== clientSecret))
      throw new HttpError(
        409,
        "등록된 앱을 바꾸면 기존 파일 접근이 끊길 수 있어요. 연결된 앱의 안전한 교체 절차가 필요합니다.",
      )
    await this.vault.set("drive-client", {
      clientId,
      clientSecret,
      namespace: prior?.namespace ?? crypto.randomUUID(),
    })
    return { ok: true }
  }
  async rotate(input: unknown) {
    const next = this.parseClient(input), db = this.env.ADMIN_DB
    const rows = (await db.prepare("SELECT key,encrypted FROM storage_secrets WHERE key IN ('drive-client','drive-grant')").all<{key:string;encrypted:string}>()).results ?? []
    const original = rows.find(row => row.key === "drive-client")?.encrypted
    const originalGrant = rows.find(row => row.key === "drive-grant")?.encrypted
    if (!original || !originalGrant) throw new HttpError(409, "Drive 연결을 먼저 완료해 주세요.")
    const prior = await this.vault.open<Client>(original, "drive-client")
    const grant = await this.vault.open<Grant>(originalGrant, "drive-grant")
    if (next.clientId !== prior.clientId) throw new HttpError(409, "기존 OAuth 앱과 같은 클라이언트 ID의 새 키만 교체할 수 있어요.")
    if (!grant.folderId || !validFileId(grant.folderId)) throw transientError()
    // Test the new secret with the current grant before overwriting anything.
    const token = await this.exchange(new URLSearchParams({grant_type:"refresh_token",refresh_token:grant.refreshToken,client_id:next.clientId,client_secret:next.clientSecret}))
    this.cachedToken = token.access_token
    const about = await this.request<{user:{emailAddress:string}}>("/about?fields=user(emailAddress)")
    if (about.user?.emailAddress?.toLowerCase() !== this.env.DRIVE_ACCOUNT_EMAIL?.toLowerCase()) throw new HttpError(403, "학회 계정을 확인하지 못했어요.")
    const folder = await this.request<{ownedByMe:boolean;trashed:boolean;appProperties?:Record<string,string>;permissions?:{role:string}[]}>(`/files/${grant.folderId}?fields=ownedByMe,trashed,appProperties,permissions`)
    if (!folder.ownedByMe || folder.trashed || folder.appProperties?.smpAdmin !== prior.namespace || !folder.permissions?.length || folder.permissions.some(p=>p.role!=="owner")) throw transientError()
    const encryptedClient = await this.vault.seal({...prior,...next},"drive-client")
    const encryptedGrant = await this.vault.seal({...grant,accessToken:token.access_token,expires:this.now+token.expires_in*1000},"drive-grant")
    const check = crypto.randomUUID()
    // CAS and the two encrypted values commit together. A concurrent reconnect
    // or refresh cannot be overwritten by an older rotation attempt.
    try { await db.batch([
      db.prepare("INSERT INTO mutation_checks(token,valid) VALUES(?,CASE WHEN (SELECT encrypted FROM storage_secrets WHERE key='drive-client')=? AND (SELECT encrypted FROM storage_secrets WHERE key='drive-grant')=? THEN 1 ELSE 0 END)").bind(check,original,originalGrant),
      db.prepare("UPDATE storage_secrets SET encrypted=? WHERE key='drive-client'").bind(encryptedClient),
      db.prepare("UPDATE storage_secrets SET encrypted=? WHERE key='drive-grant'").bind(encryptedGrant),
      db.prepare("DELETE FROM drive_oauth"),
      ...securityEventStatements(db,this.now,"drive:rotate"),
      db.prepare("DELETE FROM mutation_checks WHERE token=?").bind(check),
    ]) } catch { throw new HttpError(409, "연결 상태가 바뀌었어요. 기존 설정은 유지됩니다. 다시 확인해 주세요.") }
    return {ok:true}
  }
  async start(owner: string) {
    const client = await this.vault.get<Client>("drive-client")
    if (!client || !this.env.DRIVE_ACCOUNT_EMAIL)
      throw new HttpError(409, "먼저 Drive 연결 앱을 설정해 주세요.")
    const state = randomToken(),
      verifier = randomToken(),
      hash = await sha256(new TextEncoder().encode(state))
    await this.env.ADMIN_DB.batch([
      this.env.ADMIN_DB.prepare("DELETE FROM drive_oauth WHERE owner=? OR expires<?").bind(
        owner,
        this.now,
      ),
      this.env.ADMIN_DB.prepare(
        "INSERT INTO drive_oauth(state_hash,owner,verifier_secret,expires) VALUES(?,?,?,?)",
      ).bind(hash, owner, await this.vault.seal(verifier, `oauth:${hash}`), this.now + 10 * 60_000),
    ])
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    const challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url")
    url.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: this.env.ORIGIN + "/api/storage/drive/callback",
      response_type: "code",
      scope: driveScope,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      login_hint: this.env.DRIVE_ACCOUNT_EMAIL,
    }).toString()
    return { url: url.href }
  }
  async callback(url: URL) {
    const state = url.searchParams.get("state") ?? "",
      code = url.searchParams.get("code") ?? ""
    if (
      !/^[a-f0-9]{64}$/.test(state) ||
      !code ||
      code.length > 4096 ||
      url.searchParams.has("error")
    )
      throw new HttpError(
        400,
        "Drive 연결 승인을 완료하지 못했어요. 저장소 메뉴에서 다시 시작해 주세요.",
      )
    const hash = await sha256(new TextEncoder().encode(state))
    const attempt = await this.env.ADMIN_DB.prepare(
      "SELECT * FROM drive_oauth WHERE state_hash=? AND expires>? AND pending_secret IS NULL",
    )
      .bind(hash, this.now)
      .first<{ owner: string; verifier_secret: string }>()
    if (!attempt) throw new HttpError(400, "연결 요청이 만료됐거나 이미 사용됐어요.")
    // Claim before exchanging the one-time code. Failed attempts require restart.
    const claimed = await this.env.ADMIN_DB.prepare(
      "UPDATE drive_oauth SET pending_secret='processing' WHERE state_hash=? AND pending_secret IS NULL RETURNING state_hash",
    )
      .bind(hash)
      .first()
    if (!claimed) throw new HttpError(409, "연결 요청이 이미 처리 중입니다.")
    try {
      const client = (await this.vault.get<Client>("drive-client"))!
      const token = await this.exchange(
        new URLSearchParams({
          code,
          client_id: client.clientId,
          client_secret: client.clientSecret,
          redirect_uri: this.env.ORIGIN + "/api/storage/drive/callback",
          grant_type: "authorization_code",
          code_verifier: await this.vault.open<string>(attempt.verifier_secret, `oauth:${hash}`),
        }),
      )
      const about = await this.json<{ user: { emailAddress: string } }>(
        await this.fetch(apiRoot + "/about?fields=user(emailAddress)", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
        "계정 확인",
      )
      if (about.user?.emailAddress?.toLowerCase() !== this.env.DRIVE_ACCOUNT_EMAIL?.toLowerCase())
        throw new HttpError(403, "허용된 학회 Google 계정으로 다시 연결해 주세요.")
      if (!token.refresh_token)
        throw new HttpError(
          409,
          "지속 연결 권한을 받지 못했어요. 저장소 메뉴에서 다시 승인해 주세요.",
        )
      const pending: Grant = {
        refreshToken: token.refresh_token,
        accessToken: token.access_token,
        expires: this.now + token.expires_in * 1000,
        email: about.user.emailAddress,
      }
      await this.env.ADMIN_DB.prepare("UPDATE drive_oauth SET pending_secret=? WHERE state_hash=?")
        .bind(await this.vault.seal(pending, `pending:${hash}`), hash)
        .run()
      return new Response(null, {
        status: 303,
        headers: { Location: this.env.ORIGIN + "/#storage" },
      })
    } catch (error) {
      await this.env.ADMIN_DB.prepare("DELETE FROM drive_oauth WHERE state_hash=?").bind(hash).run()
      throw error
    }
  }
  async exchange(body: URLSearchParams) {
    const token = await this.json<{
      access_token: string
      refresh_token?: string
      expires_in: number
      scope?: string
    }>(
      await this.fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
      "인증 교환",
    )
    if (
      !token.access_token ||
      typeof token.access_token !== "string" ||
      token.access_token.length > 8192 ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0 ||
      (token.scope && token.scope.trim() !== driveScope)
    )
      throw transientError()
    return token
  }
  async confirm(owner: string) {
    const row = await this.env.ADMIN_DB.prepare(
      "SELECT state_hash,pending_secret FROM drive_oauth WHERE owner=? AND expires>? AND pending_secret IS NOT NULL AND pending_secret NOT IN ('processing','confirming') LIMIT 1",
    )
      .bind(owner, this.now)
      .first<{ state_hash: string; pending_secret: string }>()
    if (!row) throw new HttpError(409, "승인할 연결이 없어요. Google 연결부터 다시 시작해 주세요.")
    const pending = await this.vault.open<Grant>(row.pending_secret, `pending:${row.state_hash}`)
    if (pending.expires <= this.now)
      throw new HttpError(409, "연결 요청이 만료됐어요. 다시 시작해 주세요.")
    const claimed = await this.env.ADMIN_DB.prepare(
      "UPDATE drive_oauth SET pending_secret='confirming' WHERE state_hash=? AND pending_secret=? RETURNING state_hash",
    )
      .bind(row.state_hash, row.pending_secret)
      .first()
    if (!claimed) throw new HttpError(409, "연결 확인이 진행 중입니다.")
    try {
      const previous = await this.grant(),
        client = (await this.vault.get<Client>("drive-client"))!
      this.cachedToken = pending.accessToken
      let folderId = previous?.folderId
      if (folderId) {
        const folder = await this.request<{
          id: string
          trashed: boolean
          appProperties?: Record<string, string>
          ownedByMe: boolean
        }>(`/files/${folderId}?fields=id,trashed,appProperties,ownedByMe`)
        if (
          folder.trashed ||
          !folder.ownedByMe ||
          folder.appProperties?.smpAdmin !== client.namespace
        )
          throw new HttpError(409, "기존 시험 폴더의 소유권을 확인하지 못했어요.")
      } else {
        // Idempotent folder recovery if the last confirmation response was lost.
        const q = `trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='smpAdmin' and value='${client.namespace}' }`
        const found = await this.request<{ files: { id: string }[] }>(
          "/files?" + new URLSearchParams({ q, fields: "files(id)", pageSize: "2" }),
        )
        if (found.files.length > 1)
          throw new HttpError(409, "시험 폴더가 중복되어 확인이 필요합니다.")
        folderId =
          found.files[0]?.id ??
          (
            await this.request<{ id: string }>("/files?fields=id", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                appProperties: { smpAdmin: client.namespace },
              }),
            })
          ).id
      }
      if (!validFileId(folderId)) throw transientError()
      const verified = await this.request<{
        ownedByMe: boolean
        trashed: boolean
        appProperties?: Record<string, string>
        permissions?: { role: string }[]
      }>(`/files/${folderId}?fields=ownedByMe,trashed,appProperties,permissions`)
      if (
        !verified.ownedByMe ||
        verified.trashed ||
        verified.appProperties?.smpAdmin !== client.namespace ||
        verified.permissions?.some((p) => p.role !== "owner")
      )
        throw new HttpError(409, "학회 계정의 비공개 시험 폴더를 확인하지 못했어요.")
      await this.vault.set("drive-grant", { ...pending, folderId, folderName })
      await this.env.ADMIN_DB.prepare("DELETE FROM drive_oauth WHERE owner=?").bind(owner).run()
      return { ok: true }
    } catch (error) {
      await this.env.ADMIN_DB.prepare(
        "UPDATE drive_oauth SET pending_secret=? WHERE state_hash=? AND pending_secret='confirming'",
      )
        .bind(row.pending_secret, row.state_hash)
        .run()
      throw error
    }
  }
  async token() {
    if (this.cachedToken) return this.cachedToken
    const grant = await this.grant(),
      client = await this.vault.get<Client>("drive-client")
    if (
      !grant ||
      !client ||
      grant.email.toLowerCase() !== this.env.DRIVE_ACCOUNT_EMAIL?.toLowerCase()
    )
      throw new HttpError(409, "학회 Drive 연결이 필요합니다.")
    if (grant.expires > this.now + 60_000) {
      this.cachedToken = grant.accessToken
      return this.cachedToken
    }
    const token = await this.exchange(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: grant.refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      }),
    )
    await this.vault.set("drive-grant", {
      ...grant,
      accessToken: token.access_token,
      expires: this.now + token.expires_in * 1000,
    })
    this.cachedToken = token.access_token
    return this.cachedToken
  }
  async request<T>(path: string, init: RequestInit = {}) {
    if (!path.startsWith("/") || path.startsWith("//")) throw transientError()
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${await this.token()}`)
    return this.json<T>(await this.fetch(apiRoot + path, { ...init, headers }))
  }
  async context() {
    const grant = await this.grant(),
      client = await this.vault.get<Client>("drive-client")
    if (!grant?.folderId || !client || !validFileId(grant.folderId))
      throw new HttpError(409, "Drive 연결을 먼저 완료해 주세요.")
    return { folderId: grant.folderId, namespace: client.namespace }
  }
  async quota() {
    const about = await this.request<{ storageQuota: { limit?: string; usage?: string } }>(
      "/about?fields=storageQuota",
    )
    const limit = Number(about.storageQuota?.limit),
      usage = Number(about.storageQuota?.usage)
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(usage) || limit <= 0 || usage < 0)
      throw new HttpError(409, "Drive 남은 용량을 확인하지 못해 새 업로드를 중단했어요.")
    return { limit, usage, remaining: Math.max(0, limit - usage) }
  }
}
