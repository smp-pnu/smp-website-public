import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, readFile, rm, stat, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomBytes } from "node:crypto"
import sharp from "sharp"
import { createAdminApplication } from "../admin-server/app"
import { emptyFields, limits } from "../admin-lab/model"
import { samplePdf } from "../admin-lab/sample"
const origin = "http://127.0.0.1:3013"
const fields = { ...emptyFields(), title: "시험 리포트", company: "HPSP", ticker: "403870", date: "2026-10-24", semester: "2026-2", author: "리서치 1팀", targetPrice: "50000원" }
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "smp-admin-server-test-"))
  let now = Date.now(), app = createAdminApplication({ root, origin, now: () => now })
  const password = randomBytes(24).toString("base64url")
  let cookie = "", csrf = ""
  const call = (url: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...extra }
    let data: BodyInit | undefined
    if (body instanceof FormData) data = body
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; data = JSON.stringify(body) }
    return app.handle(new Request(origin + url, { method, headers, body: data }))
  }
  const session = async (response: Response) => { assert.equal(response.status, 200, await (response.status === 200 ? Promise.resolve("") : response.text())); cookie = response.headers.get("set-cookie")!.split(";")[0]; csrf = (await response.json()).csrf }
  const setup = async () => session(await call("/api/setup", "POST", { setupKey: (await readFile(path.join(root, "setup-key.txt"), "utf8")).trim(), username: "trial-admin", password }))
  const login = async () => session(await call("/api/login", "POST", { username: "trial-admin", password }))
  const form = async (overrides: Record<string, unknown> = {}) => {
    const data = new FormData()
    data.set("metadata", JSON.stringify({ filename: "sample.pdf", fields, evidence: [], warnings: [], ...overrides }))
    data.set("pdf", samplePdf(0), "sample.pdf")
    data.set("cover", new Blob([new Uint8Array(await sharp({ create: { width: 50, height: 70, channels: 3, background: "white" } }).webp().toBuffer())], { type: "image/webp" }), "cover.webp")
    return data
  }
  const upload = async () => { const response = await call("/api/drafts", "POST", await form()); assert.equal(response.status, 201, response.status === 201 ? "" : await response.text()); return response.json() }
  return { root, call, setup, login, upload, form, get app() { return app }, get cookie() { return cookie }, get csrf() { return csrf }, password,
    time: (ms: number) => { now += ms }, clear: () => { cookie = ""; csrf = "" },
    restart: () => { app.close(); app = createAdminApplication({ root, origin, now: () => now }) },
    close: async () => { app.close(); await rm(root, { recursive: true, force: true }) } }
}
test("server bootstrap is single use; password hashes and private sessions survive restart", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/drafts")).status, 401)
    assert.equal((await f.call("/api/setup", "POST", { setupKey: "wrong", username: "trial-admin", password: f.password })).status, 403)
    await f.setup()
    assert.equal((await f.call("/api/setup", "POST", {})).status, 409)
    await assert.rejects(readFile(path.join(f.root, "setup-key.txt")))
    const admin = f.app.store.db.prepare("SELECT password FROM admins").get()!
    assert.notEqual(admin.password, f.password); assert.equal(String(admin.password).split(":")[1].length, 128)
    const session = f.app.store.db.prepare("SELECT hash FROM sessions").get()!
    assert.ok(!String(session.hash).includes(f.cookie.split("=")[1]))
    assert.equal((await stat(f.root)).mode & 0o777, 0o700)
    assert.equal((await stat(path.join(f.root, "admin.sqlite"))).mode & 0o777, 0o600)
    f.restart(); assert.equal((await f.call("/api/drafts")).status, 200)
    f.clear(); assert.equal((await f.call("/api/login", "POST", { username: "trial-admin", password: "wrong" })).status, 401)
    await f.login(); assert.equal((await f.call("/api/drafts")).status, 200)
  } finally { await f.close() }
})
test("server rejects forged origins, missing CSRF, path traversal and logged-out file access", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call("/api/login", "POST", {}, { Origin: "https://evil.example" })).status, 403)
    assert.equal((await f.call("/api/session", "GET", undefined, { Host: "evil.example:3013" })).status, 403)
    await f.setup()
    const draft = await f.upload()
    assert.equal((await f.call("/api/drafts", "POST", await f.form(), { "X-CSRF-Token": "wrong" })).status, 403)
    assert.equal((await f.call(`/api/drafts/${draft.id}/pdf`)).status, 200)
    assert.equal((await f.call(`/api/drafts/${draft.id}/cover`)).status, 200)
    assert.equal((await f.call("/.smp-admin-data/admin.sqlite")).status, 404)
    assert.equal((await f.call("/api/logout", "POST", undefined, { "X-CSRF-Token": "é".repeat(64) })).status, 403)
    const oldCookie = f.cookie
    const logout = await f.call("/api/logout", "POST")
    assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie")!, /HttpOnly.*SameSite=Strict.*Max-Age=0/)
    assert.equal((await f.call(`/api/drafts/${draft.id}/pdf`, "GET", undefined, { Cookie: oldCookie })).status, 401)
    assert.equal((await f.call(`/api/drafts/${draft.id}/cover`)).status, 401)
    assert.equal((await f.call("/api/drafts")).headers.get("cache-control"), "no-store")
  } finally { await f.close() }
})
test("server upload hashes actual bytes, deduplicates, persists and authoritatively approves versions", async () => {
  const f = await fixture()
  try {
    await f.setup(); const first = await f.upload(), same = await f.upload()
    assert.equal(first.id, same.id); assert.equal(first.pages, 3); assert.equal(first.approvedRevision, null)
    assert.equal((await (await f.call("/api/drafts")).json()).length, 1)
    assert.deepEqual(new Uint8Array(await (await f.call(`/api/drafts/${first.id}/pdf`)).arrayBuffer()), new Uint8Array(await samplePdf(0).arrayBuffer()))
    assert.match((await f.call(`/api/drafts/${first.id}/pdf`)).headers.get("content-disposition")!, /^attachment;/)
    const change = (revision: number, command: unknown) => f.call(`/api/drafts/${first.id}`, "PATCH", { revision, command })
    assert.equal((await change(1, { type: "approve", reviewed: false })).status, 400)
    assert.equal((await change(1, { type: "approve", reviewed: true })).status, 200)
    assert.equal((await change(1, { type: "edit", fields: { ...fields, title: "수정본" }, approvedRevision: 2 })).status, 200)
    const edited = (await (await f.call("/api/drafts")).json())[0]
    assert.equal(edited.title, undefined); assert.equal(edited.fields.title, "수정본"); assert.equal(edited.approvedRevision, null); assert.equal(edited.revision, 2)
    assert.equal((await change(1, { type: "edit", fields })).status, 409)
    assert.equal((await change(2, { type: "remove" })).status, 400)
    assert.equal((await change(2, { type: "trash", trashed: true })).status, 200)
    assert.equal((await change(3, { type: "edit", fields })).status, 400)
    assert.equal((await change(3, { type: "trash", trashed: false })).status, 200)
    f.restart()
    const restored = (await (await f.call("/api/drafts")).json())[0]
    assert.equal(restored.fields.title, "수정본"); assert.equal(restored.trashedAt, null)
    assert.equal((await f.call(`/api/drafts/${first.id}/pdf`)).status, 200)
    assert.equal((await change(4, { type: "trash", trashed: true })).status, 200)
    assert.equal((await change(5, { type: "remove" })).status, 200)
    assert.equal((await (await f.call("/api/drafts")).json()).length, 0)
    assert.deepEqual(await readdir(path.join(f.root, "files")), [])
  } finally { await f.close() }
})
test("server validates PDF/cover bytes, metadata and quotas independently of browser checks", async () => {
  const f = await fixture()
  try {
    await f.setup()
    const fake = await f.form(); fake.set("pdf", new Blob(["<html>not a pdf</html>"], { type: "application/pdf" }), "fake.pdf")
    assert.equal((await f.call("/api/drafts", "POST", fake)).status, 400)
    const broken = await f.form(); broken.set("pdf", new Blob(["%PDF-1.7\ninvalid structure"], { type: "application/pdf" }), "broken.pdf")
    assert.equal((await f.call("/api/drafts", "POST", broken)).status, 422)
    const badCover = await f.form(); badCover.set("cover", new Blob(["<svg onload='alert(1)'/>"], { type: "image/webp" }), "bad.webp")
    assert.equal((await f.call("/api/drafts", "POST", badCover)).status, 400)
    assert.equal((await f.call("/api/drafts", "POST", await f.form({ filename: "../../report.pdf" }))).status, 400)
    assert.equal((await f.call("/api/drafts", "POST", await f.form({ fields: { ...fields, title: "x".repeat(1000) } }))).status, 400)
    assert.equal((await f.call("/api/drafts", "POST", await f.form(), { "Content-Length": String(limits.fileBytes * 2) })).status, 413)
    const first = await f.upload()
    const draft = f.app.store.get(first.id); draft.storedBytes = limits.totalBytes
    f.app.store.db.prepare("UPDATE drafts SET data=? WHERE id=?").run(JSON.stringify(draft), draft.id)
    const other = await f.form(); other.set("pdf", samplePdf(1), "other.pdf")
    assert.equal((await f.call("/api/drafts", "POST", other)).status, 413)
    assert.equal((await (await f.call("/api/drafts")).json()).length, 1)
  } finally { await f.close() }
})
test("server expires idle/absolute sessions and persists login rate limits across restarts", async () => {
  const f = await fixture()
  try {
    await f.setup(); f.time(31 * 60_000)
    assert.equal((await f.call("/api/drafts")).status, 401)
    await f.login()
    for (let i = 0; i < 24; i++) { f.time(20 * 60_000); await f.call("/api/session") }
    assert.equal((await f.call("/api/drafts")).status, 401)
    f.clear()
    for (let i = 0; i < 10; i++) assert.equal((await f.call("/api/login", "POST", { username: "nobody", password: "wrong" })).status, 401)
    f.restart()
    assert.equal((await f.call("/api/login", "POST", { username: "trial-admin", password: f.password })).status, 429)
    f.time(16 * 60_000); await f.login()
  } finally { await f.close() }
})
test("local server accepts Safari JPEG covers and normalizes them to its stored WebP format", async () => {
  const f = await fixture()
  try {
    await f.setup()
    const form = await f.form()
    const image = new Uint8Array(await sharp({ create: { width: 100, height: 140, channels: 3, background: "white" } }).jpeg().toBuffer())
    form.set("cover", new Blob([image], { type: "image/jpeg" }), "cover.jpeg")
    const response = await f.call("/api/drafts", "POST", form)
    assert.equal(response.status, 201)
    const draft = await response.json(), cover = await f.call(`/api/drafts/${draft.id}/cover`)
    assert.equal(cover.headers.get("Content-Type"), "image/webp")
    assert.equal((await sharp(Buffer.from(await cover.arrayBuffer())).metadata()).format, "webp")
  } finally { await f.close() }
})
test("server refuses non-loopback configuration; entry points cannot load production env/deploy", async () => {
  assert.throws(() => createAdminApplication({ root: "/unused", origin: "https://pnusmp.com" }), /loopback/)
  const script = await readFile(new URL("../scripts/admin-server.mjs", import.meta.url), "utf8")
  assert.doesNotMatch(script, /dotenv|wrangler|NOTION_TOKEN|CLOUDFLARE_API_TOKEN/)
  assert.match(await readFile(new URL("../.gitignore", import.meta.url), "utf8"), /\/\.smp-admin-data\//)
})

test("server accepts the requested ten-character minimum and rejects shorter setup passwords", async () => {
  const f = await fixture()
  try {
    const key = (await readFile(path.join(f.root, "setup-key.txt"), "utf8")).trim()
    const password = randomBytes(10).toString("base64url").slice(0, 10)
    assert.equal((await f.call("/api/setup", "POST", { setupKey: key, username: "trial-admin", password: password.slice(0, 9) })).status, 400)
    assert.equal((await f.call("/api/setup", "POST", { setupKey: key, username: "trial-admin", password })).status, 200)
    assert.equal((await f.call("/api/login", "POST", { username: "trial-admin", password })).status, 200)
  } finally { await f.close() }
})
