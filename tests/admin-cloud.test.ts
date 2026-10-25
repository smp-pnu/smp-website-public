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
import { allowedTrialOrigin } from "../admin-lab/mode"
import type { Database, Statement } from "../cloudflare/bindings"

const keys = crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])
const origin = "https://smp-pdf-admin-trial.smp-website.workers.dev"
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
const fields = { ...emptyFields(), title: "시험 보고서", company: "HPSP", ticker: "403870", date: "2026-10-25", semester: "2026-2", author: "리서치 1팀", targetPrice: "50,000원" }
async function fixture() {
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
  const env: Env = { ADMIN_DB: adapter, ASSETS: { async fetch() { return new Response("static") } }, ORIGIN: origin,
    ACCESS_TEAM_DOMAIN: "smp-test.cloudflareaccess.com", ACCESS_AUD: "test-audience", ADMIN_EMAIL: "admin@example.com" }
  const jwk = { ...await crypto.subtle.exportKey("jwk", (await keys).publicKey), kid: "test-key" }
  const handler = createHandler(async (input) => { assert.equal(input, "https://smp-test.cloudflareaccess.com/cdn-cgi/access/certs"); return Response.json({ keys: [jwk] }) }, () => now)
  const sign = async (changes: Record<string, unknown> = {}, headerChanges: Record<string, unknown> = {}) => {
    const head = encode({ alg: "RS256", kid: "test-key", ...headerChanges })
    const payload = encode({ iss: "https://smp-test.cloudflareaccess.com", aud: ["test-audience"], sub: "admin-sub", email: "admin@example.com", iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600, ...changes })
    const signed = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", (await keys).privateKey, new TextEncoder().encode(`${head}.${payload}`))
    return `${head}.${payload}.${Buffer.from(signed).toString("base64url")}`
  }
  const call = (path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { Origin: origin, ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}), "X-CSRF-Token": csrf, ...extra }
    let data: BodyInit | undefined
    if (body instanceof Uint8Array) { headers["Content-Type"] = "application/octet-stream"; data = body as Uint8Array<ArrayBuffer> }
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; data = JSON.stringify(body) }
    return handler(new Request(origin + path, { method, headers, body: data }), env)
  }
  const login = async () => { token = await sign(); const response = await call("/api/session"); assert.equal(response.status, 200); csrf = (await response.json()).session.csrf }
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
  return { db, env, call, login, sign, pdf, cover, meta, begin, parts, upload, setToken: (value: string) => { token = value }, time: (ms: number) => { now += ms }, get now() { return now }, close: () => db.close() }
}
test("cloud trial fails closed without Access; validates signature, issuer, audience, expiry and exact admin", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/drafts")).status, 401)
    assert.equal((await f.call("/api/session", "GET", undefined, { "Cf-Access-Authenticated-User-Email": "admin@example.com" })).status, 401)
    for (const changes of [{ email: "someone@example.com" }, { aud: ["other-app"] }, { iss: "https://evil.example" }, { exp: 0 }, { nbf: f.now / 1000 + 1000 }]) {
      f.setToken(await f.sign(changes)); assert.equal((await f.call("/api/drafts")).status, 401)
    }
    f.setToken(await f.sign({}, { alg: "none" })); assert.equal((await f.call("/api/session")).status, 401)
    const token = await f.sign(); const parts = token.split("."); parts[1] = encode({ email: "admin@example.com" }); f.setToken(parts.join("."))
    assert.equal((await f.call("/api/session")).status, 401)
    await f.login(); assert.equal((await f.call("/api/drafts")).status, 200)
    f.env.ACCESS_AUD = ""; assert.equal((await f.call("/api/drafts")).status, 503)
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
  for (const url of ["https://pnusmp.com", "https://smp-website-free.smp-website.workers.dev", "http://smp-pdf-admin-trial.smp-website.workers.dev", "https://smp-pdf-admin-trial.smp-website.workers.dev.evil.example"]) assert.equal(allowedTrialOrigin(url, "admin-cloud"), false)
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
