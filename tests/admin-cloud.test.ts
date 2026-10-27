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
import { MockDrive } from "./admin-drive-fixture"
import { DriveConnection, StorageVault } from "../admin-cloud/drive/connection"
import { safeUploadUrl } from "../admin-cloud/drive/uploads"
import { authenticator, cookieJar } from "./admin-passkey-fixture.mjs"
const origin = "https://admin.pnusmp.com"
const oldOrigin = "https://smp-pdf-admin-trial.smp-website.workers.dev"
const setupToken = "b".repeat(64)
const fields = {
  ...emptyFields(),
  title: "시험 보고서",
  company: "HPSP",
  ticker: "403870",
  date: "2026-10-25",
  semester: "2026-2",
  author: "리서치 1팀",
  targetPrice: "50,000원",
}
async function fixture(initialOrigin = origin, drive?: MockDrive) {
  let queries = 0
  const db = new DatabaseSync(":memory:")
  db.exec(await readFile(new URL("../admin-cloud/schema.sql", import.meta.url), "utf8"))
  db.exec(await readFile(new URL("../admin-cloud/history-budget.sql", import.meta.url), "utf8"))
  const adapter: Database = {
    prepare(sql: string) {
      let values: unknown[] = []
      const statement: Statement = {
        bind(...args: unknown[]) {
          values = args
          return statement
        },
        async first<T>() {
          queries++
          return (db.prepare(sql).get(...(values as never[])) as T) ?? null
        },
        async all<T>() {
          queries++
          return { results: db.prepare(sql).all(...(values as never[])) as T[] }
        },
        async run() {
          queries++
          return db.prepare(sql).run(...(values as never[]))
        },
      }
      return statement
    },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE")
      try {
        const result = []
        for (const statement of statements) result.push(await statement.run())
        db.exec("COMMIT")
        return result
      } catch (e) {
        db.exec("ROLLBACK")
        throw e
      }
    },
  }
  let now = Date.now(),
    token = "",
    csrf = ""
  const jar = cookieJar(),
    device = authenticator()
  const limits = new Map<string, { start: number; hits: number }>()
  const env: Env = {
    AUTH_LIMITER: { async limit({key}) {
      let value = limits.get(key)
      if (!value || now >= value.start + 60000) { value = {start: now, hits: 0}; limits.set(key, value) }
      return {success: ++value.hits <= 20}
    } },
    ADMIN_DB: adapter,
    ASSETS: {
      async fetch() {
        return new Response("static")
      },
    },
    ORIGIN: initialOrigin,
    DRIVE_ACCOUNT_EMAIL: "test@example.com",
    SESSION_SIGNING_KEY: "a".repeat(64),
    SETUP_TOKEN_HASH: await sha256(new TextEncoder().encode(setupToken)),
  }
  const handler = createHandler(() => now, drive?.fetch)
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) => {
    const headers: Record<string, string> = {
      Origin: env.ORIGIN,
      "CF-Connecting-IP": "192.0.2.1",
      Cookie: token || jar.read(),
      "X-CSRF-Token": csrf,
      ...extra,
    }
    let data: BodyInit | undefined
    if (body instanceof Uint8Array) {
      headers["Content-Type"] = "application/octet-stream"
      data = body as Uint8Array<ArrayBuffer>
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json"
      data = JSON.stringify(body)
    }
    queries = 0
    const response = await handler(
      new Request(env.ORIGIN + path, { method, headers, body: data }),
      env,
    )
    assert.ok(
      queries <= 50,
      `${method} ${path} exceeded Free D1's per-request query budget: ${queries}`,
    )
    jar.set(response)
    return response
  }
  const login = async () => {
    token = ""
    if (!db.prepare("SELECT value FROM admin_config").get()) {
      const options = await (
        await call("/api/auth/register/options", "POST", { mode: "setup", token: setupToken })
      ).json()
      const response = await call("/api/auth/register/verify", "POST", {
        response: device.register(options, env.ORIGIN),
        label: "Test key",
      })
      assert.equal(response.status, 200, response.status === 200 ? "" : await response.text())
      csrf = (await response.json()).session.csrf
    } else {
      const options = await (await call("/api/auth/login/options", "POST", {})).json()
      const response = await call("/api/auth/login/verify", "POST", {
        response: device.authenticate(options, env.ORIGIN),
      })
      assert.equal(response.status, 200, response.status === 200 ? "" : await response.text())
      csrf = (await response.json()).session.csrf
    }
  }
  const stepUp = async (purpose: string, extra: Record<string,string> = {}) => {
    const options = await (await call("/api/auth/reauth/options", "POST", {purpose}, extra)).json()
    const response = await call("/api/auth/reauth/verify", "POST", {response: device.authenticate(options, env.ORIGIN)}, extra)
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json()).stepUpToken as string
  }
  const pdf = new Uint8Array(await samplePdf(0).arrayBuffer())
  const cover = new Uint8Array(
    await sharp({ create: { width: 50, height: 70, channels: 3, background: "white" } })
      .webp()
      .toBuffer(),
  )
  const meta = async (bytes = pdf, overrides: Record<string, unknown> = {}) => ({
    hash: await fileIdentity(bytes),
    rawSha256: await sha256(bytes),
    filename: "sample.pdf",
    fileBytes: bytes.length,
    coverBytes: cover.length,
    pages: 3,
    fields,
    evidence: [],
    warnings: [],
    ...overrides,
  })
  const begin = async (bytes = pdf, overrides: Record<string, unknown> = {}) => {
    const res = await call("/api/uploads", "POST", await meta(bytes, overrides))
    assert.equal(res.status, 201, await (res.status === 201 ? Promise.resolve("") : res.text()))
    return res.json()
  }
  const parts = async (id: string, bytes = pdf) => {
    for (const [kind, data] of [
      ["pdf", bytes],
      ["cover", cover],
    ] as const)
      for (let offset = 0; offset < data.length; offset += chunkBytes) {
        const r = await call(
          `/api/uploads/${id}/${kind}/${offset / chunkBytes}`,
          "PUT",
          data.slice(offset, offset + chunkBytes),
        )
        assert.equal(r.status, 200, r.status === 200 ? "" : await r.text())
      }
  }
  const upload = async (bytes = pdf) => {
    const { id } = await begin(bytes)
    await parts(id, bytes)
    const r = await call(`/api/uploads/${id}/finish`, "POST")
    assert.equal(r.status, 200, r.status === 200 ? "" : await r.text())
    return r.json()
  }
  return {
    db,
    env,
    call,
    login,
    jar,
    device,
    stepUp,
    pdf,
    cover,
    meta,
    begin,
    parts,
    upload,
    setToken: (value: string) => {
      jar.clear()
      token = value
    },
    time: (ms: number) => {
      now += ms
    },
    get now() {
      return now
    },
    get queries() {
      return queries
    },
    close: () => db.close(),
  }
}
test("AI metadata endpoint requires authentication and CSRF, returns only grounded candidates and caches the call", async () => {
  const f = await fixture()
  let calls = 0
  const page =
    "Equity Research 2026.02.26\n티씨케이 (KQ.064670)\nNAND 호황기가 눈앞\n목표주가 335,500원"
  const input = { reviewed: true, hash: "a".repeat(64), pages: [page] }
  f.env.AI = {
    async run() {
      calls++
      return {
        response: {
          company: { value: "티씨케이", quote: "티씨케이 (KQ.064670)", page: 1 },
          ticker: { value: "064670", quote: "티씨케이 (KQ.064670)", page: 1 },
        },
      }
    },
  }
  try {
    assert.equal((await f.call("/api/metadata/extract", "POST", input)).status, 401)
    await f.login()
    assert.equal(
      (await f.call("/api/metadata/extract", "POST", input, { "X-CSRF-Token": "wrong" })).status,
      403,
    )
    assert.equal(
      (await f.call("/api/metadata/extract", "POST", input, { Origin: oldOrigin })).status,
      403,
    )
    assert.equal(calls, 0)
    const response = await f.call("/api/metadata/extract", "POST", input)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("Cache-Control"), "no-store")
    assert.equal((await response.json()).candidates.length, 2)
    assert.equal((await (await f.call("/api/metadata/extract", "POST", input)).json()).cached, true)
    assert.equal(calls, 1)
    assert.equal((await f.upload()).filename, "sample.pdf")
  } finally {
    f.close()
  }
})
test("cloud signed sessions reject forgery, expiry and revoked passkeys", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login()
    assert.equal((await f.call("/api/drafts")).status, 200)
    const saved = f.jar.read()
    f.setToken("__Host-smp_admin=" + "a".repeat(64) + "." + "b".repeat(64))
    assert.equal((await f.call("/api/drafts")).status, 401)
    f.setToken(saved)
    f.time(31 * 60000)
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login()
    assert.equal((await f.call("/api/logout", "POST")).status, 200)
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login()
    f.db.prepare("DELETE FROM admin_credentials").run()
    assert.equal((await f.call("/api/drafts")).status, 401)
    f.env.SESSION_SIGNING_KEY = ""
    assert.equal((await f.call("/api/drafts")).status, 503)
  } finally {
    f.close()
  }
})
test("cloud upload commits only complete verified chunks; download matches bytes; duplicate, revisions and trash work", async () => {
  const f = await fixture()
  try {
    await f.login()
    const source = new Uint8Array(
      Buffer.concat([
        Buffer.from(f.pdf.subarray(0, f.pdf.length - 8)),
        Buffer.alloc(chunkBytes * 2, 32),
        Buffer.from("\n%%EOF\n"),
      ]),
    )
    const { id } = await f.begin(source)
    assert.deepEqual(await (await f.call("/api/drafts")).json(), [])
    assert.equal((await f.call(`/api/drafts/${id}/pdf/0`)).status, 404)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 409)
    await f.parts(id, source)
    assert.equal(
      (await f.call(`/api/uploads/${id}/pdf/0`, "PUT", source.slice(0, chunkBytes))).status,
      200,
    )
    const changed = source.slice(0, chunkBytes)
    changed[30] ^= 1
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", changed)).status, 409)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 200)
    assert.equal((await f.begin(source)).draft.id, id)
    const manifest = await (await f.call(`/api/drafts/${id}/pdf`)).json(),
      chunks = []
    for (let i = 0; i < manifest.parts; i++)
      chunks.push(Buffer.from(await (await f.call(`/api/drafts/${id}/pdf/${i}`)).arrayBuffer()))
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(source))
    const coverResponse = await f.call(`/api/drafts/${id}/cover`)
    assert.equal(coverResponse.headers.get("Content-Type"), "image/webp")
    assert.deepEqual(new Uint8Array(await coverResponse.arrayBuffer()), f.cover)
    const change = (revision: number, command: unknown) =>
      f.call(`/api/drafts/${id}`, "PATCH", { revision, command })
    assert.equal((await change(1, { type: "approve", reviewed: false })).status, 400)
    assert.equal((await change(1, { type: "approve", reviewed: true })).status, 200)
    assert.equal((await change(1, { type: "edit", fields })).status, 409)
    assert.equal(
      (await change(2, { type: "edit", fields: { ...fields, title: "수정" } })).status,
      200,
    )
    const saved = (await (await f.call("/api/drafts")).json())[0]
    assert.equal(saved.approvedRevision, null)
    assert.equal(saved.revision, 3)
    assert.equal((await change(3, { type: "remove" })).status, 400)
    assert.equal((await change(3, { type: "trash", trashed: true })).status, 200)
    assert.equal((await change(4, { type: "trash", trashed: false })).status, 200)
    assert.equal((await change(5, { type: "trash", trashed: true })).status, 200)
    assert.equal((await change(6, { type: "remove" })).status, 200)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM chunks").get()!.n, 0)
  } finally {
    f.close()
  }
})
test("Safari JPEG covers upload and return their real content type with unchanged PDF bytes", async () => {
  const f = await fixture()
  try {
    await f.login()
    const cover = new Uint8Array(
      await sharp({ create: { width: 1200, height: 1600, channels: 3, background: "white" } })
        .jpeg()
        .toBuffer(),
    )
    const { id } = await f.begin(f.pdf, { coverBytes: cover.length })
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", f.pdf)).status, 200)
    assert.equal((await f.call(`/api/uploads/${id}/cover/0`, "PUT", cover)).status, 200)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 200)
    const response = await f.call(`/api/drafts/${id}/cover`)
    assert.equal(response.headers.get("Content-Type"), "image/jpeg")
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), cover)
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${id}/pdf/0`)).arrayBuffer()),
      f.pdf,
    )
  } finally {
    f.close()
  }
})
test("cover headers accept bounded JPEG variants and reject malformed, oversized or unsupported images", async () => {
  for (const progressive of [false, true]) {
    const jpeg = new Uint8Array(
      await sharp({ create: { width: 80, height: 100, channels: 3, background: "white" } })
        .jpeg({ progressive })
        .toBuffer(),
    )
    assert.equal(validateCover(jpeg, jpeg.length), "image/jpeg")
    for (const length of [2, 4, 15])
      assert.throws(() => validateCover(jpeg.slice(0, length), jpeg.length))
    const invalidLength = jpeg.slice()
    invalidLength[4] = 0
    invalidLength[5] = 0
    assert.throws(() => validateCover(invalidLength, invalidLength.length))
    assert.throws(() => validateCover(jpeg, 1024 * 1024 + 1))
  }
  const oversized = new Uint8Array(
    await sharp({ create: { width: 2049, height: 10, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer(),
  )
  assert.throws(() => validateCover(oversized, oversized.length))
  const png = new Uint8Array(
    await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } })
      .png()
      .toBuffer(),
  )
  assert.throws(() => validateCover(png, png.length))
  assert.throws(() => validateCover(new Uint8Array([0xff, 0xd8, ...Array(30).fill(0xff)]), 32))
})
test("cloud rejects cross-origin/CSRF, malformed uploads, oversized files and bad manifest identities", async () => {
  const f = await fixture()
  try {
    await f.login()
    assert.equal(
      (await f.call("/api/uploads", "POST", await f.meta(), { Origin: "https://evil.example" }))
        .status,
      403,
    )
    assert.equal(
      (await f.call("/api/uploads", "POST", await f.meta(), { "X-CSRF-Token": "" })).status,
      403,
    )
    assert.equal(
      (
        await f.call(
          "/api/uploads",
          "POST",
          await f.meta(f.pdf, { fileBytes: limits.fileBytes + 1 }),
        )
      ).status,
      400,
    )
    assert.equal(
      (await f.call("/api/uploads", "POST", await f.meta(f.pdf, { filename: "../secret.pdf" })))
        .status,
      400,
    )
    const { id } = await f.begin(f.pdf, { hash: "f".repeat(64) })
    assert.equal(
      (await f.call(`/api/uploads/${id}/pdf/0`, "PUT", new Uint8Array(f.pdf.length))).status,
      400,
    )
    assert.equal((await f.call(`/api/uploads/${id}/pdf/128`, "PUT", f.pdf)).status, 400)
    assert.equal(
      (await f.call(`/api/uploads/${id}/pdf/0`, "PUT", new Uint8Array(f.pdf.length + 1))).status,
      413,
    )
    await f.parts(id)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 400)
    assert.equal((await f.call(`/api/uploads/${id}`, "DELETE")).status, 200)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM chunks").get()!.n, 0)
    const draft = await f.upload()
    f.setToken("")
    for (const path of [
      "/api/drafts",
      `/api/drafts/${draft.id}/pdf`,
      `/api/drafts/${draft.id}/pdf/0`,
      `/api/drafts/${draft.id}/cover`,
    ])
      assert.equal((await f.call(path)).status, 401)
  } finally {
    f.close()
  }
})
test("cloud staging is bounded, expires and cleans up; rate cap and capacity are server enforced", async () => {
  const f = await fixture()
  try {
    await f.login()
    const { id } = await f.begin()
    await f.parts(id)
    assert.equal(
      (await f.call("/api/uploads", "POST", await f.meta(f.pdf, { hash: "f".repeat(64) }))).status,
      409,
    )
    f.time(31 * 60_000)
    await f.login()
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 409)
    const second = await f.begin()
    assert.notEqual(second.id, id)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM chunks").get()!.n, 0)
    await f.call(`/api/uploads/${second.id}`, "DELETE")
    // Reserve the entire logical quota in ready objects; no large allocation needed.
    for (let i = 0; i < 7; i++)
      f.db
        .prepare(
          "INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data) VALUES(?,?,'ready','admin@example.com',?,12,'{}')",
        )
        .run(crypto.randomUUID(), `capacity-${i}`, i === 6 ? 8 * 1024 * 1024 : 32 * 1024 * 1024)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta())).status, 409)
    f.db.prepare("UPDATE usage SET hits=5000 WHERE key LIKE 'day:%'").run()
    assert.equal((await f.call("/api/drafts")).status, 429)
  } finally {
    f.close()
  }
})
test("cloud build and entry point cannot import production or local credential storage", async () => {
  assert.equal(allowedTrialOrigin(origin, "admin-cloud"), true)
  for (const url of [
    oldOrigin,
    "https://pnusmp.com",
    "https://smp-website-free.smp-website.workers.dev",
    "http://admin.pnusmp.com",
    "https://admin.pnusmp.com.evil.example",
  ])
    assert.equal(allowedTrialOrigin(url, "admin-cloud"), false)
  assert.equal(legacyAdminDestination(oldOrigin, "admin-cloud"), origin + "/")
  for (const url of [origin, "https://pnusmp.com", oldOrigin + ".evil.example"])
    assert.equal(legacyAdminDestination(url, "admin-cloud"), null)
  assert.equal(legacyAdminDestination(oldOrigin, "admin-server"), null)
  for (const mode of ["admin-server", "development"]) {
    assert.equal(allowedTrialOrigin(origin, mode), false)
    assert.equal(allowedTrialOrigin("http://127.0.0.1:3013", mode), true)
  }
  const worker = await readFile(new URL("../admin-cloud/worker.ts", import.meta.url), "utf8")
  assert.doesNotMatch(
    worker,
    /admin-server\/(?:auth|store|app)|node:sqlite|process\.env|NOTION|DRIVE_CLEANUP/,
  )
  const deploy = await readFile(new URL("../scripts/admin-cloud.mjs", import.meta.url), "utf8")
  assert.match(deploy, /smp-pdf-admin-trial/)
  assert.match(deploy, /Refusing a deployment/)
  assert.doesNotMatch(deploy, /dotenv|loadEnv|smp-website-free['"]/)
})
test("cloud EOF verification crosses chunk boundaries; malformed/oversized animated covers are rejected", async () => {
  const f = await fixture()
  try {
    await f.login()
    const split = new Uint8Array(chunkBytes + 3).fill(32)
    split.set(f.pdf.slice(0, 8))
    split.set(new TextEncoder().encode("%%EOF"), chunkBytes - 2)
    await f.upload(split)
    const broken = split.slice()
    broken.fill(32, chunkBytes - 2)
    const { id } = await f.begin(broken)
    await f.parts(id, broken)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 400)
    const huge = new Uint8Array(
      await sharp({ create: { width: 2100, height: 10, channels: 3, background: "white" } })
        .webp()
        .toBuffer(),
    )
    assert.throws(() => validateCover(huge, huge.length))
    const animated = Buffer.alloc(30)
    animated.write("RIFF")
    animated.writeUInt32LE(22, 4)
    animated.write("WEBPVP8X", 8)
    animated[20] = 2
    assert.throws(() => validateCover(animated, animated.length))
    f.time(120_000)
    await f.login()
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM usage WHERE expires<?").get(f.now)!.n, 0)
  } finally {
    f.close()
  }
})

test("passkeys bind proof to challenge, origin and user verification; setup cannot be reused", async () => {
  const f = await fixture()
  try {
    assert.equal(
      (await f.call("/api/auth/register/options", "POST", { mode: "setup", token: "f".repeat(64) }))
        .status,
      403,
    )
    const options = await (
      await f.call("/api/auth/register/options", "POST", { mode: "setup", token: setupToken })
    ).json()
    assert.equal(
      (
        await f.call("/api/auth/register/verify", "POST", {
          response: f.device.register(options, "https://evil.example"),
        })
      ).status,
      403,
    )
    assert.equal(
      (
        await f.call("/api/auth/register/verify", "POST", {
          response: f.device.register(options, origin),
        })
      ).status,
      403,
    )
    await f.login()
    assert.equal(
      (await f.call("/api/auth/register/options", "POST", { mode: "setup", token: setupToken }))
        .status,
      403,
    )
    for (const type of ["wrong-origin", "no-uv", "bad-signature", "expired"]) {
      const next = await (await f.call("/api/auth/login/options", "POST", {})).json()
      const proof = f.device.authenticate(
        next,
        type === "wrong-origin" ? "https://evil.example" : origin,
        type === "no-uv" ? 1 : 5,
      )
      if (type === "bad-signature") proof.response.signature = "YQ"
      if (type === "expired") f.time(6 * 60000)
      assert.equal(
        (await f.call("/api/auth/login/verify", "POST", { response: proof })).status,
        403,
        type,
      )
    }
    assert.equal((await f.call("/api/auth/login/options", "POST", {})).status, 200)
  } finally {
    f.close()
  }
})
test("recovery replaces keys and sessions atomically, preserves drafts and rotates its secret", async () => {
  const f = await fixture()
  try {
    const options = await (
      await f.call("/api/auth/register/options", "POST", { mode: "setup", token: setupToken })
    ).json()
    const first = await (
      await f.call("/api/auth/register/verify", "POST", {
        response: f.device.register(options, origin),
      })
    ).json()
    assert.match(first.recoveryCode, /^[a-f0-9]{64}$/)
    await f.login()
    const draft = await f.upload(),
      oldCookie = f.jar.read()
    const second = authenticator()
    const next = await (
      await f.call("/api/auth/register/options", "POST", {
        mode: "recover",
        token: first.recoveryCode,
      })
    ).json()
    const result = await f.call("/api/auth/register/verify", "POST", {
      response: second.register(next, origin),
    })
    assert.equal(result.status, 200)
    const recovered = await result.json()
    assert.notEqual(first.recoveryCode, recovered.recoveryCode)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM admin_credentials").get()!.n, 1)
    assert.equal((await (await f.call("/api/drafts")).json())[0].id, draft.id)
    assert.equal(
      (
        await f.call("/api/auth/register/options", "POST", {
          mode: "recover",
          token: first.recoveryCode,
        })
      ).status,
      403,
    )
    f.setToken(oldCookie)
    assert.equal((await f.call("/api/drafts")).status, 401)
  } finally {
    f.close()
  }
})
test("admin domain migration keeps stored PDFs and only replaces the old key after valid new-domain recovery", async () => {
  const f = await fixture(oldOrigin)
  try {
    const setup = await (
      await f.call("/api/auth/register/options", "POST", { mode: "setup", token: setupToken })
    ).json()
    const first = await (
      await f.call("/api/auth/register/verify", "POST", {
        response: f.device.register(setup, oldOrigin),
      })
    ).json()
    await f.login()
    const draft = await f.upload()
    const stored = f.db.prepare("SELECT * FROM chunks ORDER BY object_id,kind,part").all()
    f.env.ORIGIN = origin
    f.setToken("") // A new hostname has its own cookie jar.
    assert.equal((await f.call("/api/auth/status").then((r) => r.json())).setupRequired, false)
    assert.equal(
      (await f.call("/api/auth/register/options", "POST", { mode: "setup", token: setupToken }))
        .status,
      403,
    )
    assert.equal((await createHandler()(new Request(oldOrigin + "/api/drafts"), f.env)).status, 403)
    assert.equal((await f.call("/api/drafts")).status, 401)
    const login = await (await f.call("/api/auth/login/options", "POST", {})).json()
    assert.equal(login.rpId, "admin.pnusmp.com")
    const oldProof = f.device.authenticate(
      { ...login, rpId: new URL(oldOrigin).hostname },
      oldOrigin,
    )
    assert.equal(
      (await f.call("/api/auth/login/verify", "POST", { response: oldProof })).status,
      403,
    )
    const nextDevice = authenticator()
    const recover = () =>
      f
        .call("/api/auth/register/options", "POST", { mode: "recover", token: first.recoveryCode })
        .then((r) => r.json())
    const invalid = await recover()
    assert.equal(invalid.rp.id, "admin.pnusmp.com")
    assert.equal(
      (
        await f.call("/api/auth/register/verify", "POST", {
          response: nextDevice.register(invalid, oldOrigin),
        })
      ).status,
      403,
    )
    assert.equal(f.db.prepare("SELECT id FROM admin_credentials").get()!.id, f.device.id)
    const options = await recover()
    const response = await f.call("/api/auth/register/verify", "POST", {
      response: nextDevice.register(options, origin),
    })
    assert.equal(response.status, 200)
    assert.notEqual((await response.json()).recoveryCode, first.recoveryCode)
    assert.equal(f.db.prepare("SELECT id FROM admin_credentials").get()!.id, nextDevice.id)
    assert.deepEqual(
      f.db.prepare("SELECT * FROM chunks ORDER BY object_id,kind,part").all(),
      stored,
    )
    f.setToken("")
    const signIn = await (await f.call("/api/auth/login/options", "POST", {})).json()
    assert.equal(
      (
        await f.call("/api/auth/login/verify", "POST", {
          response: nextDevice.authenticate(signIn, origin),
        })
      ).status,
      200,
    )
    assert.equal((await (await f.call("/api/drafts")).json())[0].id, draft.id)
  } finally {
    f.close()
  }
})
test("additional passkeys require live admin CSRF, last key is protected and removal revokes sessions", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/auth/register/options", "POST", { mode: "add" })).status, 401)
    await f.login()
    assert.equal(
      (
        await f.call(
          "/api/auth/register/options",
          "POST",
          { mode: "add" },
          { "X-CSRF-Token": "bad" },
        )
      ).status,
      403,
    )
    assert.equal(
      (await f.call("/api/auth/login/options", "POST", {}, { Origin: "https://evil.example" }))
        .status,
      403,
    )
    assert.equal((await f.call("/api/auth/keys/remove", "POST", { id: f.device.id, stepUpToken: await f.stepUp(`key:remove:${f.device.id}`) })).status, 409)
    const options = await (
      await f.call("/api/auth/register/options", "POST", { mode: "add", stepUpToken: await f.stepUp("key:add") })
    ).json()
    const second = authenticator()
    assert.equal(
      (
        await f.call("/api/auth/register/verify", "POST", {
          response: second.register(options, origin),
          label: "Second key",
        })
      ).status,
      200,
    )
    await f.login()
    assert.equal((await (await f.call("/api/auth/keys")).json()).length, 2)
    assert.equal((await f.call("/api/auth/keys/remove", "POST", { id: second.id, stepUpToken: await f.stepUp(`key:remove:${second.id}`) })).status, 200)
    const proofOptions = await (await f.call("/api/auth/login/options", "POST", {})).json()
    assert.equal(
      (
        await f.call("/api/auth/login/verify", "POST", {
          response: second.authenticate(proofOptions, origin),
        })
      ).status,
      403,
    )
    const nowCookie = f.jar.read()
    f.time(7 * 60 * 60000)
    await f.login()
    f.setToken(nowCookie)
    assert.equal((await f.call("/api/drafts")).status, 401)
  } finally {
    f.close()
  }
})

test("report ordering and bulk edits persist and reject partial/stale mutations", async () => {
  const f = await fixture()
  try {
    await f.login()
    const first = await f.upload(),
      bytes = new Uint8Array(await samplePdf(1).arrayBuffer()),
      second = await f.upload(bytes)
    const order = await (await f.call("/api/reports/order")).json()
    const ids = [second.id, first.id]
    assert.equal(
      (await f.call("/api/reports/order", "PUT", { revision: order.revision, ids })).status,
      200,
    )
    assert.deepEqual((await (await f.call("/api/reports/order")).json()).ids, ids)
    assert.equal(
      (
        await f.call("/api/reports/order", "PUT", {
          revision: order.revision,
          ids: ids.toReversed(),
        })
      ).status,
      409,
    )
    assert.equal(
      (await f.call("/api/reports/order", "PUT", { revision: order.revision + 1, ids: [first.id] }))
        .status,
      409,
    )
    const batch = (items: unknown[], action: unknown) =>
      f.call("/api/reports/batch", "POST", { items, action })
    const items = [first, second].map(({ id, revision }) => ({ id, revision }))
    assert.equal(
      (await batch(items, { type: "classify", field: "semester", value: "2027-1" })).status,
      200,
    )
    let list = await (await f.call("/api/drafts")).json()
    assert.ok(list.every((d: any) => d.fields.semester === "2027-1" && d.revision === 2))
    const stale = [
      { id: first.id, revision: 2 },
      { id: second.id, revision: 1 },
    ]
    assert.equal((await batch(stale, { type: "trash" })).status, 409)
    list = await (await f.call("/api/drafts")).json()
    assert.ok(list.every((d: any) => !d.trashedAt))
    assert.equal(
      (
        await batch(
          list.map(({ id, revision }: any) => ({ id, revision })),
          { type: "remove" },
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await batch(
          list.map(({ id, revision }: any) => ({ id, revision })),
          { type: "classify", field: "semester", value: "2027" },
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await batch(
          list.map(({ id, revision }: any) => ({ id, revision })),
          { type: "trash" },
        )
      ).status,
      200,
    )
    list = await (await f.call("/api/drafts")).json()
    assert.equal((await batch([{ id: first.id, revision: 3 }], { type: "restore" })).status, 200)
    assert.equal((await batch([{ id: second.id, revision: 3 }], { type: "remove" })).status, 200)
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM chunks WHERE object_id=?").get(second.id)!.n,
      0,
    )
    assert.ok(
      Number(f.db.prepare("SELECT count(*) AS n FROM chunks WHERE object_id=?").get(first.id)!.n) >
        0,
    )
    assert.deepEqual((await (await f.call("/api/reports/order")).json()).ids, [first.id])
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM mutation_checks").get()!.n, 0)
  } finally {
    f.close()
  }
})

test("PDF replacement is atomic, preserves ID/metadata/order, retries finish and retains the original on conflict", async () => {
  const f = await fixture()
  try {
    await f.login()
    const original = await f.upload(),
      bytes = new Uint8Array(await samplePdf(1).arrayBuffer())
    const begin = await f.begin(bytes, {
      replace: { id: original.id, revision: original.revision },
    })
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${original.id}/pdf/0`)).arrayBuffer()),
      f.pdf,
    )
    assert.equal((await f.call(`/api/uploads/${begin.id}/finish`, "POST")).status, 409)
    await f.parts(begin.id, bytes)
    const complete = await f.call(`/api/uploads/${begin.id}/finish`, "POST")
    assert.equal(complete.status, 200, await complete.clone().text())
    const replaced = await complete.json()
    assert.equal(replaced.id, original.id)
    assert.equal(replaced.revision, 2)
    assert.deepEqual(replaced.fields, original.fields)
    assert.equal(replaced.approvedRevision, null)
    assert.equal((await f.call(`/api/uploads/${begin.id}/finish`, "POST")).status, 200)
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${original.id}/pdf/0`)).arrayBuffer()),
      bytes,
    )
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM objects").get()!.n, 1)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM replacements").get()!.n, 0)
    const pending = await f.begin(f.pdf, { replace: { id: original.id, revision: 2 } })
    await f.parts(pending.id)
    assert.equal(
      (
        await f.call(`/api/drafts/${original.id}`, "PATCH", {
          revision: 2,
          command: { type: "edit", fields: { ...original.fields, title: "관리자가 수정한 제목" } },
        })
      ).status,
      200,
    )
    assert.equal((await f.call(`/api/uploads/${pending.id}/finish`, "POST")).status, 409)
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${original.id}/pdf/0`)).arrayBuffer()),
      bytes,
    )
    await f.call(`/api/uploads/${pending.id}`, "DELETE")
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM objects").get()!.n, 1)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM mutation_checks").get()!.n, 0)
    assert.equal(
      (
        await f.call(
          "/api/uploads",
          "POST",
          await f.meta(f.pdf, { replace: { id: original.id, revision: 2 } }),
        )
      ).status,
      409,
    )
  } finally {
    f.close()
  }
})

const noticeInput = () => ({
  title: "홈커밍 안내",
  category: "행사",
  date: "2026-10-26",
  pinned: true,
  blocks: [{ id: crypto.randomUUID(), type: "paragraph", text: "본문 내용" }],
})
test("notice order persists independently with auth, CSRF, pinned groups and stale-list protection", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/notices/order")).status, 401)
    assert.equal((await f.call("/api/notices/order", "PUT", { revision: 1, ids: [] })).status, 401)
    await f.login()
    const create = async (title: string, pinned: boolean, date: string) =>
      (await f.call("/api/notices", "POST", { ...noticeInput(), title, pinned, date })).json()
    const a = await create("고정 A", true, "2026-10-10"), b = await create("고정 B", true, "2026-10-11")
    const c = await create("일반 C", false, "2026-10-12"), d = await create("일반 D", false, "2026-10-13")
    const reportOrder = await (await f.call("/api/reports/order")).json()
    const order = await (await f.call("/api/notices/order")).json()
    assert.deepEqual(order.ids, [b.id, a.id, d.id, c.id])
    const before = f.db.prepare("SELECT * FROM notices ORDER BY id").all()
    const ids = [a.id, b.id, c.id, d.id]
    const put = (revision: number, values: unknown[], extra = {}) => f.call("/api/notices/order", "PUT", { revision, ids: values }, extra)
    assert.equal((await put(order.revision, ids, { "X-CSRF-Token": "" })).status, 403)
    assert.equal((await put(order.revision, ids, { Origin: "https://evil.example" })).status, 403)
    assert.equal((await put(order.revision, [c.id, a.id, b.id, d.id])).status, 409, "pinned must stay above ordinary notices")
    assert.equal((await put(order.revision, [a.id, a.id, c.id, d.id])).status, 400)
    assert.equal((await put(order.revision, [a.id, b.id, c.id, crypto.randomUUID()])).status, 409)
    assert.equal((await put(order.revision, [a.id, b.id, c.id])).status, 409, "filtered subsets cannot delete hidden IDs")
    const changed = await put(order.revision, ids)
    assert.equal(changed.status, 200, await changed.clone().text())
    const saved = await changed.json()
    assert.deepEqual(saved.ids, ids)
    assert.equal(saved.revision, order.revision + 1)
    assert.deepEqual((await (await f.call("/api/notices/order")).json()).ids, ids)
    assert.deepEqual(await (await f.call("/api/reports/order")).json(), reportOrder)
    assert.deepEqual(f.db.prepare("SELECT * FROM notices ORDER BY id").all(), before, "order must not edit notice contents or approval revisions")
    assert.equal((await put(order.revision, [b.id, a.id, d.id, c.id])).status, 409)
    const e = await create("새 일반 E", false, "2026-10-14")
    assert.deepEqual((await (await f.call("/api/notices/order")).json()).ids, [a.id, b.id, e.id, c.id, d.id])
    assert.equal((await put(saved.revision, ids)).status, 409, "a new notice invalidates old complete-list payloads")
    assert.equal((await f.call(`/api/notices/${e.id}`, "PATCH", { revision: 1, action: "trash" })).status, 200)
    assert.deepEqual((await (await f.call("/api/notices/order")).json()).ids, ids)
    assert.equal((await put(saved.revision, [...ids, e.id])).status, 409, "trash cannot enter the active order")
    assert.equal((await f.call(`/api/notices/${e.id}`, "PATCH", { revision: 2, action: "restore" })).status, 200)
    assert.deepEqual((await (await f.call("/api/notices/order")).json()).ids, [a.id, b.id, e.id, c.id, d.id])
    assert.equal((await f.call(`/api/notices/${c.id}`, "PATCH", { revision: 1, action: "edit", fields: { ...c, pinned: true } })).status, 200)
    const pinnedNow = await (await f.call("/api/notices/order")).json()
    assert.deepEqual(pinnedNow.ids, [a.id, b.id, c.id, e.id, d.id])
    assert.equal((await put(pinnedNow.revision, [a.id, b.id, e.id, c.id, d.id])).status, 409)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM mutation_checks").get()!.n, 0)
  } finally { f.close() }
})
test("notice CRUD, image references, validation, revision protection and cascading deletion", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/notices")).status, 401)
    await f.login()
    const created = await f.call("/api/notices", "POST", noticeInput())
    assert.equal(created.status, 201, await created.clone().text())
    let n = await created.json()
    const asset = await f.call(`/api/notices/${n.id}/images`, "POST", f.cover)
    assert.equal(asset.status, 201, await asset.clone().text())
    const { id: assetId } = await asset.json()
    const body = {
      ...n,
      blocks: [...n.blocks, { id: crypto.randomUUID(), type: "image", assetId, text: "행사 사진" }],
    }
    const patch = (action: string, revision: number, fields?: unknown) =>
      f.call(`/api/notices/${n.id}`, "PATCH", { revision, action, fields, reviewed: true })
    const saved = await patch("edit", 1, body)
    assert.equal(saved.status, 200, await saved.clone().text())
    n = await saved.json()
    assert.equal(
      f.db.prepare("SELECT expires FROM notice_assets WHERE id=?").get(assetId)!.expires,
      null,
    )
    assert.equal((await patch("edit", 1, { ...body, title: "오래된 제목" })).status, 409)
    assert.equal(
      (
        await patch("edit", 2, {
          ...body,
          blocks: [{ ...body.blocks[0], href: "javascript:alert(1)" }],
        })
      ).status,
      400,
    )
    assert.equal(
      (
        await patch("edit", 2, {
          ...body,
          blocks: [{ ...body.blocks[1], assetId: crypto.randomUUID() }],
        })
      ).status,
      400,
    )
    assert.equal((await patch("edit", 2, { ...body, date: "2026-02-30" })).status, 400)
    const list = await (await f.call("/api/notices")).json()
    assert.equal(list[0].title, n.title)
    assert.equal(list[0].blocks, undefined)
    assert.match(list[0].excerpt, /본문/)
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/notice-assets/${assetId}`)).arrayBuffer()),
      f.cover,
    )
    const approved = await (await patch("approve", 2)).json()
    assert.equal(approved.approvedRevision, 3)
    assert.equal((await patch("remove", 3)).status, 400)
    assert.equal((await patch("trash", 3)).status, 200)
    assert.equal((await patch("edit", 4, body)).status, 400)
    assert.equal((await patch("restore", 4)).status, 200)
    assert.equal((await patch("trash", 5)).status, 200)
    assert.equal((await patch("remove", 6)).status, 200)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM notice_assets").get()!.n, 0)
    assert.equal((await f.call(`/api/notice-assets/${assetId}`)).status, 404)
  } finally {
    f.close()
  }
})

test("notice image ownership, shared quota, auth and staged asset collection are enforced", async () => {
  const f = await fixture()
  try {
    await f.login()
    const n = await (await f.call("/api/notices", "POST", noticeInput())).json(),
      other = await (await f.call("/api/notices", "POST", noticeInput())).json()
    const { id } = await (await f.call(`/api/notices/${n.id}/images`, "POST", f.cover)).json()
    const image = { id: crypto.randomUUID(), type: "image", assetId: id, text: "caption" }
    assert.equal(
      (
        await f.call(`/api/notices/${other.id}`, "PATCH", {
          revision: 1,
          action: "edit",
          fields: { ...other, blocks: [image] },
        })
      ).status,
      400,
    )
    assert.equal(
      (
        await f.call(
          `/api/notices/${n.id}/images`,
          "POST",
          new TextEncoder().encode('<svg onload="alert(1)"/>'),
        )
      ).status,
      400,
    )
    assert.equal(
      (await f.call(`/api/notices/${n.id}/images`, "POST", f.cover, { "X-CSRF-Token": "" })).status,
      403,
    )
    f.time(25 * 3600000)
    await f.login()
    await f.call("/api/notices")
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM notice_assets").get()!.n, 0)
    // PDFs and images share the same logical 200 MiB ceiling.
    for (let i = 0; i < 7; i++)
      f.db
        .prepare(
          "INSERT INTO objects(id,hash,status,owner,pdf_bytes,cover_bytes,data) VALUES(?,?,'ready','test',?,12,'{}')",
        )
        .run(crypto.randomUUID(), `quota-${i}`, i === 6 ? 8 * 1024 * 1024 : 32 * 1024 * 1024)
    assert.equal((await f.call(`/api/notices/${n.id}/images`, "POST", f.cover)).status, 409)
    f.setToken("")
    assert.equal((await f.call(`/api/notices/${n.id}`)).status, 401)
    assert.equal((await f.call(`/api/notice-assets/${id}`)).status, 401)
  } finally {
    f.close()
  }
})

test("30-day trash collection removes PDFs and notice images, never live content", async () => {
  const f = await fixture()
  try {
    await f.login()
    const report = await f.upload(),
      live = await f.upload(new Uint8Array(await samplePdf(1).arrayBuffer()))
    const n = await (await f.call("/api/notices", "POST", noticeInput())).json()
    await f.call(`/api/notices/${n.id}/images`, "POST", f.cover)
    await f.call(`/api/drafts/${report.id}`, "PATCH", {
      revision: 1,
      command: { type: "trash", trashed: true },
    })
    await f.call(`/api/notices/${n.id}`, "PATCH", { revision: 1, action: "trash" })
    f.time(29 * 86400000)
    await f.login()
    await f.call("/api/drafts")
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM objects").get()!.n, 2)
    f.time(2 * 86400000)
    await f.login()
    await f.call("/api/drafts")
    assert.equal(f.db.prepare("SELECT id FROM objects").get()!.id, live.id)
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM chunks WHERE object_id=?").get(report.id)!.n,
      0,
    )
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM notices").get()!.n, 0)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM notice_assets").get()!.n, 0)
  } finally {
    f.close()
  }
})

const driveClient = () => ({
  web: {
    client_id: "123-test.apps.googleusercontent.com",
    client_secret: "test-client-secret-only",
    redirect_uris: [origin + "/api/storage/drive/callback"],
  },
})
async function connectDrive(f: Awaited<ReturnType<typeof fixture>>) {
  assert.equal((await f.call("/api/storage/drive/configure", "POST", driveClient())).status, 200)
  const start = await (await f.call("/api/storage/drive/start", "POST")).json(),
    url = new URL(start.url)
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file")
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.equal(
    (
      await f.call(
        "/api/storage/drive/callback?state=" + url.searchParams.get("state") + "&code=mock-code",
      )
    ).status,
    303,
  )
  assert.equal((await f.call("/api/storage/drive/confirm", "POST")).status, 200)
}

test("Drive OAuth is authenticated, state/PKCE protected, account restricted and stores encrypted credentials only", async () => {
  const google = new MockDrive(),
    f = await fixture(origin, google)
  try {
    assert.equal((await f.call("/api/storage/status")).status, 401)
    await f.login()
    assert.equal(
      (
        await f.call("/api/storage/drive/configure", "POST", driveClient(), {
          "X-CSRF-Token": "wrong",
        })
      ).status,
      403,
    )
    assert.equal(
      (await f.call("/api/storage/drive/callback?state=" + "a".repeat(64) + "&code=stolen")).status,
      400,
    )
    await connectDrive(f)
    const status = await (await f.call("/api/storage/status")).json()
    assert.equal(status.connected, true)
    assert.equal(status.email, google.email)
    const secrets = JSON.stringify(f.db.prepare("SELECT * FROM storage_secrets").all())
    for (const secret of ["test-client-secret-only", "test-refresh", "test-access"])
      assert.ok(!secrets.includes(secret))
    const unsupported = {
      web: { ...driveClient().web, client_id: "other.apps.googleusercontent.com" },
    }
    assert.equal((await f.call("/api/storage/drive/configure", "POST", unsupported)).status, 409)
    const start = await (await f.call("/api/storage/drive/start", "POST")).json(),
      url = new URL(start.url)
    google.email = "another@example.com"
    assert.equal(
      (
        await f.call(
          "/api/storage/drive/callback?state=" + url.searchParams.get("state") + "&code=mock-code",
        )
      ).status,
      403,
    )
    assert.equal((await f.call("/api/storage/drive/confirm", "POST")).status, 409)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM drive_oauth").get()!.n, 0)
  } finally {
    f.close()
  }
})

test("Drive transport keeps native fetch unbound, rejects redirects and retains resumable acknowledgements", async () => {
  let calls = 0, status = 308, location = false
  const connection = new DriveConnection({ ADMIN_DB: {} as Database, ORIGIN: origin }, Date.now(), async function (this: unknown, url, init) {
    assert.equal(this, undefined)
    assert.equal(init?.redirect, "manual")
    calls++
    return new Response(null, { status, headers: location ? { Location: "https://outside.invalid" } : { Range: "bytes=0-262143" } })
  })
  assert.equal((await connection.fetch("https://www.googleapis.com/upload/drive/v3/files", { method: "PUT" })).status, 308)
  location = true
  await assert.rejects(connection.fetch("https://www.googleapis.com/upload/drive/v3/files", { method: "PUT" }))
  status = 302
  await assert.rejects(connection.fetch("https://oauth2.googleapis.com/token"))
  assert.equal(calls, 3, "redirect destinations must never be requested")
})

test("Drive OAuth failures identify the failing stage without exposing upstream credentials", async () => {
  for (const [path, status, stage] of [
    ["/token", 401, "인증 교환"],
    ["/drive/v3/about", 403, "계정 확인"],
  ] as const) {
    const google = new MockDrive(), original = google.fetch
    google.fetch = async (url, init) => new URL(url).pathname === path
      ? Response.json({ error: "private upstream diagnostic", access_token: "DO-NOT-DISCLOSE" }, { status })
      : original(url, init)
    const f = await fixture(origin, google)
    try {
      await f.login()
      await f.call("/api/storage/drive/configure", "POST", driveClient())
      const { url } = await (await f.call("/api/storage/drive/start", "POST")).json()
      const state = new URL(url).searchParams.get("state")
      const response = await f.call(`/api/storage/drive/callback?state=${state}&code=mock-code`)
      assert.equal(response.status, 503)
      const body = await response.text()
      assert.ok(body.includes(stage))
      assert.ok(body.includes(`HTTP ${status}`))
      assert.ok(!body.includes("DO-NOT-DISCLOSE"))
      assert.ok(!body.includes("private upstream"))
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM drive_oauth").get()!.n, 0)
      assert.equal(google.files.size, 0)
    } finally { f.close() }
  }
})

test("Drive PDF upload stores only proofs in D1, reconciles lost responses, checks SHA-256 and downloads identical bytes", async () => {
  const google = new MockDrive(),
    f = await fixture(origin, google)
  try {
    await f.login()
    await connectDrive(f)
    const source = new Uint8Array(
      Buffer.concat([
        Buffer.from(f.pdf.subarray(0, f.pdf.length - 8)),
        Buffer.alloc(chunkBytes * 2, 32),
        Buffer.from("\n%%EOF\n"),
      ]),
    )
    const { id } = await f.begin(source)
    google.lossAfterWrite = true
    assert.equal(
      (await f.call(`/api/uploads/${id}/pdf/0`, "PUT", source.slice(0, chunkBytes))).status,
      503,
    )
    assert.equal(
      (await f.call(`/api/uploads/${id}/pdf/0`, "PUT", source.slice(0, chunkBytes))).status,
      200,
    )
    await f.parts(id, source)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 200)
    assert.ok(f.queries <= 50, `D1 query count ${f.queries}`)
    const proofBytes = f.db
      .prepare("SELECT sum(length(data)) AS bytes FROM chunks WHERE object_id=? AND kind='pdf'")
      .get(id)!.bytes as number
    assert.ok(proofBytes < 12000)
    const file = f.db.prepare("SELECT * FROM report_files").get()!
    assert.equal(file.provider, "drive")
    assert.equal(file.managed, 1)
    assert.equal(file.source_sha256, await sha256(source))
    const chunks = []
    for (let part = 0; part < Math.ceil(source.length / chunkBytes); part++) {
      const response = await f.call(`/api/drafts/${id}/pdf/${part}`)
      assert.equal(response.status, 200)
      chunks.push(Buffer.from(await response.arrayBuffer()))
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(source))
    const overview = await (await f.call("/api/library/status")).json()
    assert.equal(overview.bytes, f.cover.length)
    assert.ok(
      google.calls.every(
        (call) =>
          new URL(call.url).hostname === "www.googleapis.com" ||
          new URL(call.url).hostname === "oauth2.googleapis.com",
      ),
    )
  } finally {
    f.close()
  }
})

test("approved PDF and fields survive editing and replacement; trash/restore and publication tasks stay isolated", async () => {
  const f = await fixture()
  try {
    await f.login()
    const first = await f.upload()
    assert.equal(
      (
        await f.call(`/api/drafts/${first.id}`, "PATCH", {
          revision: 1,
          command: { type: "approve", reviewed: true },
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await f.call(`/api/drafts/${first.id}`, "PATCH", {
          revision: 2,
          command: { type: "edit", fields: { ...fields, title: "새 초안" } },
        })
      ).status,
      200,
    )
    const incoming = new Uint8Array(await samplePdf(1).arrayBuffer()),
      begun = await f.begin(incoming, { replace: { id: first.id, revision: 3 } })
    await f.parts(begun.id, incoming)
    assert.equal((await f.call(`/api/uploads/${begun.id}/finish`, "POST")).status, 200)
    assert.ok(f.queries <= 50)
    const release = await (await f.call(`/api/drafts/${first.id}/release`)).json()
    assert.equal(release.draft.fields.title, fields.title)
    assert.equal(release.draft.revision, 2)
    assert.equal(release.publication, "trial-only")
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${first.id}/release/pdf/0`)).arrayBuffer()),
      f.pdf,
    )
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${first.id}/pdf/0`)).arrayBuffer()),
      incoming,
    )
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM report_jobs").get()!.n, 1)
    assert.equal(f.db.prepare("SELECT owner FROM report_releases").get()!.owner, "admin-trial")
    assert.equal(
      (
        await f.call(`/api/drafts/${first.id}`, "PATCH", {
          revision: 4,
          command: { type: "trash", trashed: true },
        })
      ).status,
      200,
    )
    assert.equal((await f.call(`/api/drafts/${first.id}/release`)).status, 404)
    assert.equal(
      (
        await f.call(`/api/drafts/${first.id}`, "PATCH", {
          revision: 5,
          command: { type: "trash", trashed: false },
        })
      ).status,
      200,
    )
    assert.equal((await f.call(`/api/drafts/${first.id}/release`)).status, 200)
    assert.equal(
      (
        await f.call(`/api/drafts/${first.id}`, "PATCH", {
          revision: 6,
          command: { type: "approve", reviewed: true },
        })
      ).status,
      200,
    )
    assert.deepEqual(
      new Uint8Array(await (await f.call(`/api/drafts/${first.id}/release/pdf/0`)).arrayBuffer()),
      incoming,
    )
  } finally {
    f.close()
  }
})

test("Drive deletion waits 30 days, retains failed cleanup records, and never permanently deletes a file", async () => {
  const google = new MockDrive(),
    f = await fixture(origin, google)
  try {
    await f.login()
    await connectDrive(f)
    const report = await f.upload()
    const file = f.db.prepare("SELECT * FROM report_files").get()!
    await f.call(`/api/drafts/${report.id}`, "PATCH", {
      revision: 1,
      command: { type: "trash", trashed: true },
    })
    await f.call(`/api/drafts/${report.id}`, "PATCH", { revision: 2, command: { type: "remove" } })
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM objects").get()!.n, 0)
    assert.equal(google.files.get(file.file_id as string)!.trashed, false)
    await f.call("/api/storage/maintenance", "POST")
    assert.equal(google.files.get(file.file_id as string)!.trashed, false)
    f.time(31 * 86400000)
    await f.login()
    google.trashFailures = true
    const failed = await (await f.call("/api/storage/maintenance", "POST")).json()
    assert.equal(failed.failed, 1)
    assert.equal(f.db.prepare("SELECT state FROM report_files").get()!.state, "pending-delete")
    f.time(2 * 86400000)
    await f.login()
    google.trashFailures = false
    const complete = await (await f.call("/api/storage/maintenance", "POST")).json()
    assert.equal(complete.removed, 1)
    assert.equal(google.files.get(file.file_id as string)!.trashed, true)
    assert.equal(f.db.prepare("SELECT state FROM report_files").get()!.state, "deleted")
    assert.ok(!google.calls.some((c) => c.method === "DELETE"))
  } finally {
    f.close()
  }
})

test("expired/cancelled uploads are quarantined; unrelated and modified Drive files are not trashed", async () => {
  const google = new MockDrive(),
    f = await fixture(origin, google)
  try {
    await f.login()
    await connectDrive(f)
    const upload = await f.begin()
    await f.parts(upload.id)
    await f.call(`/api/uploads/${upload.id}`, "DELETE")
    const pending = f.db.prepare("SELECT * FROM abandoned_drive_files").get()!
    f.time(31 * 86400000)
    await f.login()
    google.files.get(pending.file_id as string)!.appProperties.smpAdmin = "another-app"
    const result = await (await f.call("/api/storage/maintenance", "POST")).json()
    assert.equal(result.failed, 1)
    assert.equal(google.files.get(pending.file_id as string)!.trashed, false)
    assert.equal(f.db.prepare("SELECT attempts FROM abandoned_drive_files").get()!.attempts, 1)
    assert.ok(!google.calls.some((c) => c.method === "PATCH"))
    assert.throws(() =>
      safeUploadUrl("https://attacker.test/upload/drive/v3/files?uploadType=resumable&upload_id=x"),
    )
    const vault = new StorageVault(f.env),
      sealed = await vault.seal({ secret: "test" }, "one")
    await assert.rejects(() => vault.open(sealed, "two"))
  } finally {
    f.close()
  }
})

test("legacy bulk changes and permanent removal of five reports stay within the Free query limit", async () => {
  const f = await fixture()
  try {
    await f.login()
    const reports = []
    for (let i = 0; i < 5; i++)
      reports.push(
        await f.upload(new Uint8Array(Buffer.concat([f.pdf, Buffer.from(`\n% fixture ${i}\n`)]))),
      )
    // Emulate the pre-migration database: original objects/chunks only.
    f.db.exec(
      "DELETE FROM report_releases; DELETE FROM report_versions; DELETE FROM report_file_bindings; DELETE FROM report_files; DELETE FROM report_storage",
    )
    const items = reports.map((r) => ({ id: r.id, revision: r.revision }))
    assert.equal(
      (
        await f.call("/api/reports/batch", "POST", {
          items,
          action: { type: "classify", field: "industry", value: "반도체" },
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await f.call("/api/reports/batch", "POST", {
          items: items.map((r) => ({ ...r, revision: 2 })),
          action: { type: "trash" },
        })
      ).status,
      200,
    )
    f.db.exec(
      "DELETE FROM report_versions; DELETE FROM report_file_bindings; DELETE FROM report_files; DELETE FROM report_storage",
    )
    assert.equal(
      (
        await f.call("/api/reports/batch", "POST", {
          items: items.map((r) => ({ ...r, revision: 3 })),
          action: { type: "remove" },
        })
      ).status,
      200,
    )
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM objects").get()!.n, 0)
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM report_files WHERE state='pending-delete'").get()!.n,
      5,
    )
  } finally {
    f.close()
  }
})

test("history budget rejects a write atomically and does not destroy the last approval", async () => {
  const f = await fixture()
  try {
    await f.login()
    const report = await f.upload()
    await f.call(`/api/drafts/${report.id}`, "PATCH", {
      revision: 1,
      command: { type: "approve", reviewed: true },
    })
    const before = f.db.prepare("SELECT data FROM objects WHERE id=?").get(report.id)!.data
    f.db.prepare("UPDATE history_budget SET bytes=33554432 WHERE id=1").run()
    assert.equal(
      (
        await f.call(`/api/drafts/${report.id}`, "PATCH", {
          revision: 2,
          command: { type: "edit", fields: { ...fields, title: "must not save" } },
        })
      ).status,
      409,
    )
    assert.equal(f.db.prepare("SELECT data FROM objects WHERE id=?").get(report.id)!.data, before)
    assert.equal(
      (await (await f.call(`/api/drafts/${report.id}/release`)).json()).draft.revision,
      2,
    )
    assert.throws(() => f.db.prepare("UPDATE report_versions SET data='{}'").run(), /IMMUTABLE/)
    // A full history does not prevent explicit deletion of an already trashed report.
    f.db
      .prepare("UPDATE objects SET data=json_set(data,'$.trashedAt','2026-01-01') WHERE id=?")
      .run(report.id)
    assert.equal(
      (
        await f.call(`/api/drafts/${report.id}`, "PATCH", {
          revision: 2,
          command: { type: "remove" },
        })
      ).status,
      200,
    )
  } finally {
    f.close()
  }
})

test("Drive quota/day cap and full-file checksum fail closed without altering saved content", async () => {
  const google = new MockDrive(),
    f = await fixture(origin, google)
  try {
    await f.login()
    await connectDrive(f)
    google.quotaRemaining = 64 * 1024 * 1024
    assert.equal((await f.call("/api/uploads", "POST", await f.meta())).status, 409)
    assert.equal(google.sessions.size, 0)
    google.quotaRemaining = 1024 ** 3
    const key = `drive-new:${Math.floor(f.now / 86400000)}`
    f.db.prepare("INSERT INTO usage(key,hits,expires) VALUES(?,10,?)").run(key, f.now + 86400000)
    assert.equal((await f.call("/api/uploads", "POST", await f.meta())).status, 429)
    assert.equal(google.sessions.size, 0)
    f.db.prepare("DELETE FROM usage WHERE key=?").run(key)
    const { id } = await f.begin()
    f.db
      .prepare("UPDATE drive_uploads SET expected_sha256=? WHERE object_id=?")
      .run("0".repeat(64), id)
    assert.equal((await f.call(`/api/uploads/${id}/pdf/0`, "PUT", f.pdf)).status, 409)
    assert.equal((await f.call(`/api/uploads/${id}/finish`, "POST")).status, 409)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM objects WHERE status='ready'").get()!.n, 0)
  } finally {
    f.close()
  }
})

test("OAuth callback works without a session but only authenticated confirmation writes Drive", async () => {
  const google = new MockDrive(),
    f = await fixture(origin, google)
  try {
    await f.login()
    await f.call("/api/storage/drive/configure", "POST", driveClient())
    const { url } = await (await f.call("/api/storage/drive/start", "POST")).json(),
      state = new URL(url).searchParams.get("state")
    assert.equal(
      (
        await f.call(`/api/storage/drive/callback?state=${state}&code=test`, "GET", undefined, {
          Cookie: "",
        })
      ).status,
      303,
    )
    assert.equal(google.files.size, 0)
    assert.equal(
      (await f.call("/api/storage/drive/confirm", "POST", undefined, { Cookie: "" })).status,
      401,
    )
    assert.equal(
      (await f.call("/api/storage/drive/confirm", "POST", undefined, { "X-CSRF-Token": "wrong" }))
        .status,
      403,
    )
    assert.equal(google.files.size, 0)
    assert.equal((await f.call("/api/storage/drive/confirm", "POST")).status, 200)
    assert.equal(google.files.size, 1)
    assert.equal((await f.call("/api/storage/drive/confirm", "POST")).status, 409)
  } finally {
    f.close()
  }
})


test("unauthenticated floods cannot spend another IP's login budget or write D1 after limiting", async () => {
  const f = await fixture()
  try {
    await f.login()
    for(let i=0;i<220;i++) {
      const r = await f.call("/api/auth/login/options", "POST", {}, {"CF-Connecting-IP":"192.0.2.99", "X-Forwarded-For": `198.51.100.${i}`})
      assert.equal(r.status, i < 20 ? 200 : 429)
      if(i >= 20) assert.equal(f.queries, 0)
    }
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM usage WHERE key LIKE 'auth-%'").get()!.n, 0)
    assert.equal((await f.call("/api/auth/login/options", "POST", {})).status, 200)
    // Proofs are isolated even when the same NAT has spent its start budget.
    const options = await (await f.call("/api/auth/login/options", "POST", {}, {"CF-Connecting-IP":"192.0.2.55"})).json()
    const flowCookie = f.jar.read()
    for(let i=0;i<21;i++) await f.call("/api/auth/login/options", "POST", {}, {"CF-Connecting-IP":"192.0.2.55"})
    assert.equal((await f.call("/api/auth/login/verify", "POST", {response:f.device.authenticate(options,origin)}, {"CF-Connecting-IP":"192.0.2.55",Cookie:flowCookie})).status, 200)
    f.time(60001)
    assert.equal((await f.call("/api/auth/login/options", "POST", {}, {"CF-Connecting-IP":"192.0.2.99"})).status,200)
  } finally { f.close() }
})

test("step-up requires an existing key and binds one-use authority to action, session and expiry", async () => {
  const f = await fixture()
  try {
    await f.login(); f.time(20*60000)
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add"})).status,403)
    const options = await (await f.call("/api/auth/reauth/options", "POST", {purpose:"key:add"})).json()
    const stranger = authenticator()
    assert.equal((await f.call("/api/auth/reauth/verify", "POST", {response:stranger.authenticate(options,origin)})).status,403)
    let grant = await f.stepUp("key:add")
    assert.equal((await f.call("/api/auth/keys/remove", "POST", {id:f.device.id,stepUpToken:grant})).status,403)
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add",stepUpToken:grant})).status,200)
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add",stepUpToken:grant})).status,403)
    grant = await f.stepUp("key:add"); f.time(120001)
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add",stepUpToken:grant})).status,403)
    grant = await f.stepUp("key:add"); await f.login()
    assert.equal((await f.call("/api/auth/register/options", "POST", {mode:"add",stepUpToken:grant})).status,403)
  } finally { f.close() }
})


test("Drive secret rotation needs step-up, preserves the app namespace and rolls back invalid keys", async () => {
  const google = new MockDrive(), f = await fixture(origin, google)
  try {
    await f.login(); await connectDrive(f)
    const vault = new StorageVault(f.env)
    const before = await vault.get<{namespace:string;clientId:string;clientSecret:string}>("drive-client")
    const grant = await vault.get<{folderId:string;refreshToken:string}>("drive-grant")
    const client = driveClient(); client.web.client_secret="new-secret-for-test-only"
    assert.equal((await f.call("/api/storage/drive/rotate","POST",{client})).status,403)
    google.rejectedSecret=client.web.client_secret
    assert.equal((await f.call("/api/storage/drive/rotate","POST",{client,stepUpToken:await f.stepUp("drive:rotate")})).status,503)
    assert.deepEqual(await vault.get("drive-client"),before)
    google.rejectedSecret=""
    const wrong = driveClient(); wrong.web.client_id="different.apps.googleusercontent.com"
    assert.equal((await f.call("/api/storage/drive/rotate","POST",{client:wrong,stepUpToken:await f.stepUp("drive:rotate")})).status,409)
    assert.equal((await f.call("/api/storage/drive/rotate","POST",{client,stepUpToken:await f.stepUp("drive:rotate")})).status,200)
    assert.deepEqual(await vault.get("drive-client"),{...before,clientSecret:client.web.client_secret})
    assert.equal((await vault.get<{folderId:string}>("drive-grant"))!.folderId,grant!.folderId)
    assert.equal(google.files.size,1)
    assert.equal((await f.call("/api/storage/drive/quota")).status,200)
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM security_events WHERE action='drive:rotate'").get()!.n,1)
    for(const row of f.db.prepare("SELECT encrypted FROM storage_secrets").all())assert.ok(!String(row.encrypted).includes(client.web.client_secret))
  } finally {f.close()}
})
