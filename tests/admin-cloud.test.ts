import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import sharp from "sharp"
import { createHandler, type Env } from "../admin-cloud/worker"
import { chunkBytes, fileIdentity } from "../admin-cloud/protocol"
import { emptyFields, limits } from "../admin-lab/model"
import { samplePdf } from "../admin-lab/sample"
import { validateCover } from "../admin-cloud/files"
import { allowedTrialOrigin, legacyAdminDestination } from "../admin-lab/mode"
import type { Database, Statement } from "../cloudflare/bindings"

import { sha256 } from "../admin-cloud/protocol"
import { authenticator, cookieJar } from "./admin-passkey-fixture.mjs"
const origin = "https://admin.pnusmp.com"
const oldOrigin = "https://smp-pdf-admin-trial.smp-website.workers.dev"
const setupToken = "b".repeat(64)
const fields = { ...emptyFields(), title: "시험 보고서", company: "HPSP", ticker: "403870", date: "2026-10-25", semester: "2026-2", author: "리서치 1팀", targetPrice: "50,000원" }
async function fixture(initialOrigin = origin) {
  const db = new DatabaseSync(":memory:"); db.exec(await readFile(new URL("../admin-cloud/schema.sql", import.meta.url), "utf8"))
  const adapter: Database = {
    prepare(sql: string) {
      let values: unknown[] = []
      const statement: Statement = {
        bind(...args: unknown[]) { values = args; return statement },
        async first<T>() { return (db.prepare(sql).get(...values as never[]) as T) ?? null },
        async all<T>() { return { results: db.prepare(sql).all(...values as never[]) as T[] } },
        async run() { return db.prepare(sql).run(...values as never[]) },
      }; return statement
    },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE")
      try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec("COMMIT"); return result }
      catch (e) { db.exec("ROLLBACK"); throw e }
    },
  }
  let now = Date.now(), token = "", csrf = ""
  const jar = cookieJar(), device = authenticator()
  const env: Env = { ADMIN_DB: adapter, ASSETS: { async fetch() { return new Response("static") } }, ORIGIN: initialOrigin,
    SESSION_SIGNING_KEY: "a".repeat(64), SETUP_TOKEN_HASH: await sha256(new TextEncoder().encode(setupToken)) }
  const handler = createHandler(() => now)
  const call = async (path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { Origin: env.ORIGIN, Cookie: token || jar.read(), "X-CSRF-Token": csrf, ...extra }
    let data: BodyInit | undefined
    if (body instanceof Uint8Array) { headers["Content-Type"] = "application/octet-stream"; data = body as Uint8Array<ArrayBuffer> }
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; data = JSON.stringify(body) }
    const response = await handler(new Request(env.ORIGIN + path, { method, headers, body: data }), env)
    jar.set(response); return response
  }
  const login = async () => {
    token = ""
    if (!db.prepare("SELECT value FROM admin_config").get()) {
      const options = await (await call("/api/auth/register/options", "POST", {mode:"setup",token:setupToken})).json()
      const response = await call("/api/auth/register/verify", "POST", {response:device.register(options, env.ORIGIN),label:"Test key"})
      assert.equal(response.status, 200, response.status === 200 ? "" : await response.text())
      csrf = (await response.json()).session.csrf
    } else {
      const options = await (await call("/api/auth/login/options", "POST", {})).json()
      const response = await call("/api/auth/login/verify", "POST", {response:device.authenticate(options, env.ORIGIN)})
      assert.equal(response.status, 200, response.status === 200 ? "" : await response.text()); csrf = (await response.json()).session.csrf
    }
  }
  const pdf = new Uint8Array(await samplePdf(0).arrayBuffer())
  const cover = new Uint8Array(await sharp({ create: { width: 50, height: 70, channels: 3, background: "white" } }).webp().toBuffer())
  const meta = async (bytes = pdf, overrides: Record<string, unknown> = {}) => ({ hash: await fileIdentity(bytes), filename: "sample.pdf", fileBytes: bytes.length, coverBytes: cover.length, pages: 3, fields, evidence: [], warnings: [], ...overrides })
  const begin = async (bytes = pdf, overrides: Record<string, unknown> = {}) => { const res = await call("/api/uploads", "POST", await meta(bytes, overrides)); assert.equal(res.status, 201, await (res.status === 201 ? Promise.resolve("") : res.text())); return res.json() }
  const parts = async (id: string, bytes = pdf) => {
    for (const [kind, data] of [["pdf", bytes], ["cover", cover]] as const) for (let offset = 0; offset < data.length; offset += chunkBytes) {
      const r = await call(`/api/uploads/${id}/${kind}/${offset / chunkBytes}`, "PUT", data.slice(offset, offset + chunkBytes))
      assert.equal(r.status, 200, r.status === 200 ? "" : await r.text())
    }
  }
  const upload = async (bytes = pdf) => { const { id } = await begin(bytes); await parts(id, bytes); const r = await call(`/api/uploads/${id}/finish`, "POST"); assert.equal(r.status, 200, r.status === 200 ? "" : await r.text()); return r.json() }
  return { db, env, call, login, jar, device, pdf, cover, meta, begin, parts, upload, setToken: (value: string) => { jar.clear(); token = value }, time: (ms: number) => { now += ms }, get now() { return now }, close: () => db.close() }
}
test("cloud signed sessions reject forgery, expiry and revoked passkeys", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login(); assert.equal((await f.call("/api/drafts")).status, 200)
    const saved = f.jar.read()
    f.setToken("__Host-smp_admin=" + "a".repeat(64) + "." + "b".repeat(64))
    assert.equal((await f.call("/api/drafts")).status, 401)
    f.setToken(saved); f.time(31 * 60000)
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login()
    assert.equal((await f.call("/api/logout", "POST")).status, 200)
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login(); f.db.prepare("DELETE FROM admin_credentials").run()
    assert.equal((await f.call("/api/drafts")).status, 401)
    f.env.SESSION_SIGNING_KEY = ""; assert.equal((await f.call("/api/drafts")).status, 503)
  } finally { f.close() }
})
test("cloud upload commits only complete verified chunks; download matches bytes; duplicate, revisions and trash work", async () => {
  const f = await fixture()
  try {
    await f.login()
    const source = new Uint8Array(Buffer.concat([Buffer.from(f.pdf.subarray(0, f.pdf.length - 8)), Buffer.alloc(chunkBytes * 2, 32), Buffer.from("\n%%EOF\n")]))
    const { id } = await f.begin(source)
    assert.deepEqual(await (await f.call("/api/drafts")).json(), [])
    assert.equal((await f.call(`/api/drafts/${id}/pdf/0`)).status, 404)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 409)
    await f.parts(id, source)
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", source.slice(0, chunkBytes))).status, 200)
    const changed = source.slice(0, chunkBytes); changed[30] ^= 1
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", changed)).status, 409)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 200)
    assert.equal((await f.begin(source)).draft.id, id)
    const manifest = await (await f.call(`/api/drafts/${id}/pdf`)).json(), chunks = []
    for (let i = 0; i < manifest.parts; i++) chunks.push(Buffer.from(await (await f.call(`/api/drafts/${id}/pdf/${i}`)).arrayBuffer()))
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(source))
    assert.deepEqual(new Uint8Array(await (await f.call(`/api/drafts/${id}/cover`)).arrayBuffer()), f.cover)
    const change = (revision: number, command: unknown) => f.call(`/api/drafts/${id}`, "PATCH", { revision, command })
    assert.equal((await change(1, { type: "approve", reviewed: false })).status, 400)
    assert.equal((await change(1, { type: "approve", reviewed: true })).status, 200)
    assert.equal((await change(1, { type: "edit", fields })).status, 409)
    assert.equal((await change(2, { type: "edit", fields: { ...fields, title: "수정" } })).status, 200)
    const saved = (await (await f.call("/api/drafts")).json())[0]
    assert.equal(saved.approvedRevision, null); assert.equal(saved.revision, 3)
    assert.equal((await change(3, { type: "remove" })).status, 400)
    assert.equal((await change(3, { type: "trash", trashed: true })).status, 200)
    assert.equal((await change(4, { type: "trash", trashed: false })).status, 200)
    assert.equal((await change(5, { type: "trash", trashed: true })).status, 200)
    assert.equal((await change(6, { type: "remove" })).status, 200)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM chunks").get()!.n, 0)
  } finally { f.close() }
})
test("cloud rejects cross-origin/CSRF, malformed uploads, oversized files and bad manifest identities", async () => {
  const f = await fixture()
  try {
    await f.login()
    assert.equal((await f.call("/api/uploads", "POST", await f.meta(), { Origin: "https://evil.example" })).status, 403)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta(), { "X-CSRF-Token": "" })).status, 403)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta(f.pdf, { fileBytes: limits.fileBytes + 1 }))).status, 400)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta(f.pdf, { filename: "../secret.pdf" }))).status, 400)
    const { id } = await f.begin(f.pdf, { hash: "f".repeat(64) })
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", new Uint8Array(f.pdf.length))).status, 400)
    assert.equal((await f.call(`/api/uploads/${id}/pdf/128`, "PUT", f.pdf)).status, 400)
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", new Uint8Array(f.pdf.length + 1))).status, 413)
    await f.parts(id)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 400)
    assert.equal((await f.call(`/api/uploads/${id}`, "DELETE")).status, 200)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM chunks").get()!.n, 0)
    const draft = await f.upload(); f.setToken("")
    for (const path of ["/api/drafts", `/api/drafts/${draft.id}/pdf`, `/api/drafts/${draft.id}/pdf/0`, `/api/drafts/${draft.id}/cover`]) assert.equal((await f.call(path)).status, 401)
  } finally { f.close() }
})
test("cloud staging is bounded, expires and cleans up; rate cap and capacity are server enforced", async () => {
  const f = await fixture()
  try {
    await f.login(); const { id } = await f.begin(); await f.parts(id)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta(f.pdf, { hash: "f".repeat(64) }))).status, 409)
    f.time(31 * 60_000); await f.login()
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 409)
    const second = await f.begin(); assert.notEqual(second.id, id)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM chunks").get()!.n, 0)
    await f.call(`/api/uploads/${second.id}`, "DELETE")
    // Reserve the entire logical quota in ready objects; no large allocation needed.
    for (let i = 0; i < 7; i++) f.db.prepare("INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data) VALUES(?,?,'ready','admin@example.com',?,12,'{}')").run(crypto.randomUUID(), `capacity-${i}`, i === 6 ? 8 * 1024 * 1024 : 32 * 1024 * 1024)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta())).status, 409)
    f.db.prepare("UPDATE usage SET hits=5000 WHERE key LIKE 'day:%'").run()
    assert.equal((await f.call("/api/drafts")).status, 429)
  } finally { f.close() }
})
test("cloud build and entry point cannot import production or local credential storage", async () => {
  assert.equal(allowedTrialOrigin(origin, "admin-cloud"), true)
  for (const url of [oldOrigin, "https://pnusmp.com", "https://smp-website-free.smp-website.workers.dev", "http://admin.pnusmp.com", "https://admin.pnusmp.com.evil.example"]) assert.equal(allowedTrialOrigin(url, "admin-cloud"), false)
  assert.equal(legacyAdminDestination(oldOrigin, "admin-cloud"), origin + "/")
  for (const url of [origin, "https://pnusmp.com", oldOrigin + ".evil.example"]) assert.equal(legacyAdminDestination(url, "admin-cloud"), null)
  assert.equal(legacyAdminDestination(oldOrigin, "admin-server"), null)
  for (const mode of ["admin-server", "development"]) {
    assert.equal(allowedTrialOrigin(origin, mode), false)
    assert.equal(allowedTrialOrigin("http://127.0.0.1:3013", mode), true)
  }
  const worker = await readFile(new URL("../admin-cloud/worker.ts", import.meta.url), "utf8")
  assert.doesNotMatch(worker, /admin-server\/(?:auth|store|app)|node:sqlite|process\.env|NOTION|DRIVE/)
  const deploy = await readFile(new URL("../scripts/admin-cloud.mjs", import.meta.url), "utf8")
  assert.match(deploy, /smp-pdf-admin-trial/); assert.match(deploy, /Refusing a deployment/)
  assert.doesNotMatch(deploy, /dotenv|loadEnv|smp-website-free['"]/)
})
test("cloud EOF verification crosses chunk boundaries; malformed/oversized animated covers are rejected", async () => {
  const f = await fixture()
  try {
    await f.login()
    const split = new Uint8Array(chunkBytes + 3).fill(32)
    split.set(f.pdf.slice(0, 8)); split.set(new TextEncoder().encode("%%EOF"), chunkBytes - 2)
    await f.upload(split)
    const broken = split.slice(); broken.fill(32, chunkBytes - 2)
    const { id } = await f.begin(broken); await f.parts(id, broken)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 400)
    const huge = new Uint8Array(await sharp({ create: { width: 2100, height: 10, channels: 3, background: "white" } }).webp().toBuffer())
    assert.throws(() => validateCover(huge, huge.length))
    const animated = Buffer.alloc(30); animated.write("RIFF"); animated.writeUInt32LE(22, 4); animated.write("WEBPVP8X", 8); animated[20] = 2
    assert.throws(() => validateCover(animated, animated.length))
    f.time(120_000); await f.login()
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM usage WHERE expires<?").get(f.now)!.n, 0)
  } finally { f.close() }
})

test("passkeys bind proof to challenge, origin and user verification; setup cannot be reused", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"setup",token:"f".repeat(64)})).status, 403)
    const options = await (await f.call("/api/auth/register/options", "POST", {mode:"setup",token:setupToken})).json()
    assert.equal((await f.call("/api/auth/register/verify", "POST", {response:f.device.register(options, "https://evil.example")})).status, 403)
    assert.equal((await f.call("/api/auth/register/verify", "POST", {response:f.device.register(options, origin)})).status, 403)
    await f.login()
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"setup",token:setupToken})).status, 403)
    for (const type of ["wrong-origin", "no-uv", "bad-signature", "expired"]) {
      const next = await (await f.call("/api/auth/login/options", "POST", {})).json()
      const proof = f.device.authenticate(next, type === "wrong-origin" ? "https://evil.example" : origin, type === "no-uv" ? 1 : 5)
      if (type === "bad-signature") proof.response.signature = "YQ"
      if (type === "expired") f.time(6 * 60000)
      assert.equal((await f.call("/api/auth/login/verify", "POST", {response:proof})).status, 403, type)
    }
    f.db.prepare("UPDATE usage SET hits=200 WHERE key LIKE 'auth-day:%'").run()
    assert.equal((await f.call("/api/auth/login/options", "POST", {})).status, 429)
  } finally { f.close() }
})
test("recovery replaces keys and sessions atomically, preserves drafts and rotates its secret", async () => {
  const f = await fixture()
  try {
    const options = await (await f.call("/api/auth/register/options", "POST", {mode:"setup",token:setupToken})).json()
    const first = await (await f.call("/api/auth/register/verify", "POST", {response:f.device.register(options, origin)})).json()
    assert.match(first.recoveryCode, /^[a-f0-9]{64}$/)
    await f.login(); const draft = await f.upload(), oldCookie = f.jar.read()
    const second = authenticator()
    const next = await (await f.call("/api/auth/register/options", "POST", {mode:"recover",token:first.recoveryCode})).json()
    const result = await f.call("/api/auth/register/verify", "POST", {response:second.register(next, origin)})
    assert.equal(result.status, 200)
    const recovered = await result.json(); assert.notEqual(first.recoveryCode, recovered.recoveryCode)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM admin_credentials").get()!.n, 1)
    assert.equal((await (await f.call("/api/drafts")).json())[0].id, draft.id)
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"recover",token:first.recoveryCode})).status, 403)
    f.setToken(oldCookie); assert.equal((await f.call("/api/drafts")).status, 401)
  } finally { f.close() }
})
test("admin domain migration keeps stored PDFs and only replaces the old key after valid new-domain recovery", async () => {
  const f = await fixture(oldOrigin)
  try {
    const setup = await (await f.call("/api/auth/register/options", "POST", {mode:"setup",token:setupToken})).json()
    const first = await (await f.call("/api/auth/register/verify", "POST", {response:f.device.register(setup, oldOrigin)})).json()
    await f.login(); const draft = await f.upload()
    const stored = f.db.prepare("SELECT * FROM chunks ORDER BY object_id,kind,part").all()
    f.env.ORIGIN = origin; f.setToken("") // A new hostname has its own cookie jar.
    assert.equal((await f.call("/api/auth/status").then(r => r.json())).setupRequired, false)
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"setup",token:setupToken})).status, 403)
    assert.equal((await createHandler()(new Request(oldOrigin + "/api/drafts"), f.env)).status, 403)
    assert.equal((await f.call("/api/drafts")).status, 401)
    const login = await (await f.call("/api/auth/login/options", "POST", {})).json()
    assert.equal(login.rpId, "admin.pnusmp.com")
    const oldProof = f.device.authenticate({...login,rpId:new URL(oldOrigin).hostname}, oldOrigin)
    assert.equal((await f.call("/api/auth/login/verify", "POST", {response:oldProof})).status, 403)
    const nextDevice = authenticator()
    const recover = () => f.call("/api/auth/register/options", "POST", {mode:"recover",token:first.recoveryCode}).then(r => r.json())
    const invalid = await recover(); assert.equal(invalid.rp.id, "admin.pnusmp.com")
    assert.equal((await f.call("/api/auth/register/verify", "POST", {response:nextDevice.register(invalid, oldOrigin)})).status, 403)
    assert.equal(f.db.prepare("SELECT id FROM admin_credentials").get()!.id, f.device.id)
    const options = await recover()
    const response = await f.call("/api/auth/register/verify", "POST", {response:nextDevice.register(options, origin)})
    assert.equal(response.status, 200)
    assert.notEqual((await response.json()).recoveryCode, first.recoveryCode)
    assert.equal(f.db.prepare("SELECT id FROM admin_credentials").get()!.id, nextDevice.id)
    assert.deepEqual(f.db.prepare("SELECT * FROM chunks ORDER BY object_id,kind,part").all(), stored)
    f.setToken("")
    const signIn = await (await f.call("/api/auth/login/options", "POST", {})).json()
    assert.equal((await f.call("/api/auth/login/verify", "POST", {response:nextDevice.authenticate(signIn, origin)})).status, 200)
    assert.equal((await (await f.call("/api/drafts")).json())[0].id, draft.id)
  } finally { f.close() }
})
test("additional passkeys require live admin CSRF, last key is protected and removal revokes sessions", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add"})).status, 401)
    await f.login()
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add"}, {"X-CSRF-Token":"bad"})).status, 403)
    assert.equal((await f.call("/api/auth/login/options", "POST", {}, {Origin:"https://evil.example"})).status, 403)
    assert.equal((await f.call("/api/auth/keys/remove", "POST", {id:f.device.id})).status, 409)
    const options = await (await f.call("/api/auth/register/options", "POST", {mode:"add"})).json()
    const second = authenticator()
    assert.equal((await f.call("/api/auth/register/verify", "POST", {response:second.register(options, origin),label:"Second key"})).status, 200)
    await f.login()
    assert.equal((await (await f.call("/api/auth/keys")).json()).length, 2)
    assert.equal((await f.call("/api/auth/keys/remove", "POST", {id:second.id})).status, 200)
    const proofOptions = await (await f.call("/api/auth/login/options", "POST", {})).json()
    assert.equal((await f.call("/api/auth/login/verify", "POST", {response:second.authenticate(proofOptions,origin)})).status, 403)
    const nowCookie = f.jar.read()
    f.time(7 * 60 * 60000); await f.login(); f.setToken(nowCookie)
    assert.equal((await f.call("/api/drafts")).status, 401)
  } finally { f.close() }
})
