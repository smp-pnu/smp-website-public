import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash, createHmac } from "node:crypto"
import { runInNewContext } from "node:vm"
import { queueDriveCleanup } from "../lib/drive-cleanup-relay"

const worker = readFileSync(new URL("../scripts/drive-cleanup/Code.gs", import.meta.url), "utf8")
const reports = "a".repeat(32), notices = "b".repeat(32), rootId = "reports_root_12345"
const pageId = "c".repeat(32), otherId = "d".repeat(32), fileId = "report_pdf_12345"
const token = "test-notion-token-12345678901234567890"
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function page(id = pageId, source = reports, url = `https://drive.google.com/file/d/${fileId}/view`) {
  return { id, object: "page", in_trash: false, last_edited_time: "2026-10-06T00:00:00Z",
    parent: { type: "data_source_id", data_source_id: source },
    properties: { "공개": { checkbox: true }, "외부 링크": { url } } }
}
function fixture() {
  const props: Record<string, string> = { NOTION_TOKEN: token, REPORTS_DATA_SOURCE_ID: reports,
    NOTICES_DATA_SOURCE_ID: notices, DRIVE_REPORTS_ROOT_ID: rootId, ENABLED: "true" }
  const pages: Record<string, any> = { [pageId]: page() }
  const bodies: Record<string, any[]> = {}
  const calls: string[] = []
  const f = { trashed: false, mutations: 0, owner: "school@example.com", mime: "application/pdf", inside: true }
  let failPath = "", corruptPagination = false, restoreBeforeTrash = false, pageReads = 0
  let queryHook: (() => void) | undefined
  const iterator = (items: any[]) => ({ hasNext: () => !!items.length, next: () => items.shift() })
  const root = { getId: () => rootId, getOwner: () => ({ getEmail: () => "school@example.com" }),
    isTrashed: () => false, getParents: () => iterator([]) }
  const context: any = {
    console: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({ ...props }),
      getProperty: (key: string) => props[key] ?? null, setProperty: (key: string, value: string) => { props[key] = value },
      setProperties: (values: object) => Object.assign(props, values), deleteProperty: (key: string) => { delete props[key] } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { sleep() {}, Charset: { UTF_8: "utf8" }, DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_: string, text: string) => [...createHash("sha256").update(text).digest()],
      computeHmacSha256Signature: (text: string, key: string) => [...createHmac("sha256", key).update(text).digest()] },
    DriveApp: { getFolderById: () => root, getFileById: (id: string) => {
      assert.equal(id, fileId)
      return { isTrashed: () => f.trashed, getOwner: () => ({ getEmail: () => f.owner }), getMimeType: () => f.mime,
        getParents: () => iterator(f.inside ? [root] : []), setTrashed: (value: boolean) => { assert.equal(value, true); f.trashed = true; f.mutations++ } }
    } },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (value: string) => ({ setMimeType: () => JSON.parse(value) }) },
    UrlFetchApp: { fetch: (url: string, options: any) => {
      const path = url.replace("https://api.notion.com/v1/", "")
      calls.push(path); assert.equal(options.headers.Authorization, `Bearer ${token}`)
      let status = path === failPath ? 503 : 200, data: any
      if (path === `data_sources/${reports}` || path === `data_sources/${notices}`) data = { id: path.split("/")[1], in_trash: false }
      else if (path.endsWith("/query")) {
        queryHook?.()
        const source = path.split("/")[1]
        data = { results: Object.values(pages).filter(p => !p.in_trash && p.parent.data_source_id === source),
          has_more: corruptPagination, next_cursor: corruptPagination ? "repeated" : null }
      } else if (path.startsWith("pages/")) {
        pageReads++
        if (restoreBeforeTrash && pageReads === 2) pages[pageId].in_trash = false
        data = pages[path.split("/")[1]]
        if (!data) status = 404
      } else if (/^blocks\/[a-f0-9]{32}\/children\?/.test(path)) data = { results: bodies[path.split("/")[1]] ?? [], has_more: false }
      else throw new Error(`Unexpected endpoint ${path}`)
      return { getResponseCode: () => status, getContentText: () => JSON.stringify(data) }
    } },
  }
  runInNewContext(worker, context)
  return { context, props, pages, bodies, calls, f, run: (preview = false) => clone(context.smpRun_(preview)),
    fail: (path: string) => { failPath = path }, badCursor: () => { corruptPagination = true },
    restoreAtFinalCheck: () => { restoreBeforeTrash = true; pageReads = 0 },
    onQuery: (hook: () => void) => { queryHook = hook } }
}

test("unpublishing retains the PDF; a confirmed row deletion trashes it once", () => {
  const x = fixture(); x.run()
  x.pages[pageId].properties["공개"].checkbox = false
  x.run(); assert.equal(x.f.mutations, 0)
  x.pages[pageId].in_trash = true
  assert.equal(x.run().trashed, 1); assert.equal(x.f.trashed, true)
  x.run(); assert.equal(x.f.mutations, 1)
})
test("an unpublished report or a notice body sharing the PDF prevents deletion", () => {
  for (const bodyReference of [false, true]) {
    const x = fixture()
    x.pages[otherId] = page(otherId, bodyReference ? notices : reports, bodyReference ? "" : undefined)
    x.pages[otherId].properties["공개"].checkbox = false
    if (bodyReference) x.bodies[otherId] = [{ id: "e".repeat(32), type: "paragraph", paragraph: { rich_text: [{ text: { content: "Download", link: { url: `https://drive.google.com/file/d/${fileId}/view` } } }] } }]
    x.run(); x.pages[pageId].in_trash = true
    assert.equal(x.run().shared, 1); assert.equal(x.f.mutations, 0)
  }
})
test("failed database or page reads and repeated cursors never become deletions", () => {
  for (const target of [`data_sources/${notices}/query`, `pages/${pageId}`]) {
    const x = fixture(); x.run(); x.pages[pageId].in_trash = true; x.fail(target)
    assert.throws(() => x.run(), /Notion request failed/); assert.equal(x.f.mutations, 0)
  }
  const x = fixture(); x.run(); delete x.pages[pageId]
  assert.throws(() => x.run(), /404/); assert.equal(x.f.mutations, 0)
  const y = fixture(); y.badCursor()
  assert.throws(() => y.run(), /pagination/); assert.equal(y.f.mutations, 0)
})
test("preview, outside folders, foreign ownership and non-PDFs cannot mutate files", () => {
  for (const mode of ["preview", "outside", "owner", "mime"]) {
    const x = fixture(); x.run(); x.pages[pageId].in_trash = true
    if (mode === "outside") x.f.inside = false
    if (mode === "owner") x.f.owner = "someone@example.com"
    if (mode === "mime") x.f.mime = "application/vnd.google-apps.folder"
    x.run(mode === "preview"); assert.equal(x.f.mutations, 0)
  }
})
test("restoring a page during a scan and moving a page out of the DB retain its file", () => {
  const x = fixture(); x.run(); x.pages[pageId].in_trash = true; x.restoreAtFinalCheck()
  x.run(); assert.equal(x.f.mutations, 0)
  const y = fixture(); y.run(); y.pages[pageId].parent.data_source_id = "e".repeat(32)
  y.run(); assert.equal(y.f.mutations, 0)
})
test("partial body scans checkpoint progress; nothing is deleted until all references were checked", () => {
  const x = fixture(); x.run()
  for (let i = 1; i <= 65; i++) { const id = i.toString(16).padStart(32, "0"); x.pages[id] = page(id, reports, "") }
  x.pages[pageId].in_trash = true
  assert.equal(x.run().pendingReferences, true); assert.equal(x.f.mutations, 0)
  assert.equal(x.run().pendingReferences, false); assert.equal(x.f.mutations, 1)
})
test("a new reference created during the body scan postpones deletion", () => {
  const x = fixture(); x.run(); x.pages[pageId].in_trash = true
  let queries = 0
  x.onQuery(() => { if (++queries === 3) x.pages[otherId] = page(otherId) })
  assert.equal(x.run().skipped, 1); assert.equal(x.f.mutations, 0)
  assert.equal(x.run().shared, 1); assert.equal(x.f.mutations, 0)
})
test("authenticated hints cover pages created and deleted between scans; altered and expired hints fail", () => {
  const x = fixture(); x.pages[pageId].in_trash = true
  const payload = JSON.stringify({ version: 1, pageId, issuedAt: Date.now() })
  const sign = (value: string) => createHmac("sha256", token).update(`smp-drive-cleanup-v1\n${value}`).digest("hex")
  const post = (value: string, signature: string) => x.context.doPost({ postData: { contents: JSON.stringify({ payload: value, signature }) } })
  assert.equal(post(payload, "0".repeat(64)).ok, false)
  const expired = JSON.stringify({ version: 1, pageId, issuedAt: Date.now() - 700000 })
  assert.equal(post(expired, sign(expired)).ok, false)
  assert.equal(post(payload, sign(payload)).ok, true)
  assert.equal(x.f.mutations, 0) // Hint intake never calls Drive mutation.
  x.run(); assert.equal(x.f.mutations, 1)
})
test("checkpoint corruption and scope changes fail closed", () => {
  const x = fixture(); x.run(); x.pages[pageId].in_trash = true
  x.props[`STATE_${x.props.STATE_SLOT}_0`] += "tampered"
  assert.throws(() => x.run(), /Corrupt/); assert.equal(x.f.mutations, 0)
  const y = fixture(); y.run(); y.props.DRIVE_REPORTS_ROOT_ID = "different_root_12345"
  assert.throws(() => y.run(), /scope changed/); assert.equal(y.f.mutations, 0)
})
test("Drive URL recognition rejects lookalike domains, folder URLs and unexpected protocols", () => {
  const x = fixture()
  for (const url of ["https://drive.google.com.evil.test/file/d/report_pdf_12345/view", "https://evil.test/?url=https://drive.google.com/file/d/report_pdf_12345/view", "http://drive.google.com/file/d/report_pdf_12345/view", "https://drive.google.com/drive/folders/report_pdf_12345"]) {
    assert.equal(x.context.smpDriveId_(url), null)
  }
})
test("relay sends only a signed page ID and reports worker rejections for Notion retries", async () => {
  const originalFetch = globalThis.fetch
  const oldURL = process.env.DRIVE_CLEANUP_WEB_APP_URL, oldToken = process.env.NOTION_TOKEN
  process.env.DRIVE_CLEANUP_WEB_APP_URL = "https://script.google.com/macros/s/test-deployment/exec"
  process.env.NOTION_TOKEN = token
  try {
    globalThis.fetch = (async (_url, options) => {
      const request = JSON.parse(String(options?.body))
      assert.equal(request.signature, createHmac("sha256", token).update(`smp-drive-cleanup-v1\n${request.payload}`).digest("hex"))
      assert.equal(JSON.parse(request.payload).pageId, pageId)
      assert.equal(String(options?.body).includes(token), false)
      return Response.json({ ok: true })
    }) as typeof fetch
    await queueDriveCleanup(pageId)
    globalThis.fetch = (async () => Response.json({ ok: false })) as typeof fetch
    await assert.rejects(queueDriveCleanup(pageId), /rejected/)
    process.env.DRIVE_CLEANUP_WEB_APP_URL = "https://evil.test/exec"
    await assert.rejects(queueDriveCleanup(pageId), /configured/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldURL) process.env.DRIVE_CLEANUP_WEB_APP_URL = oldURL; else delete process.env.DRIVE_CLEANUP_WEB_APP_URL
    if (oldToken) process.env.NOTION_TOKEN = oldToken; else delete process.env.NOTION_TOKEN
  }
})
