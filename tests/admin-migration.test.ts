import assert from "node:assert/strict"
import { test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import { mkdtemp, writeFile, readFile, stat, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createMigrationPlan, assetReference, sha, type Snapshot, type PublicationRow } from "../admin-migration/plan"
import { stagePlan, rehearsalSchema } from "../admin-migration/rehearsal"
import { toContentItem, type NotionPage } from "../lib/content-model"

const time = "2026-10-26T03:00:00.000Z"
const id = (n: number) => `00000000-0000-8000-8000-${String(n).padStart(12, "0")}`
const compact = (n: number) => id(n).replaceAll("-", "")
function page(n = 1, published = true): NotionPage {
  return {
    id: id(n), object: "page", created_time: time, last_edited_time: time,
    properties: {
      제목: { type: "title", title: [{ plain_text: "시험 리포트" }] },
      공개: { type: "checkbox", checkbox: published },
      게시일: { type: "date", date: { start: "2026-10-01" } },
      학기: { type: "rich_text", rich_text: [{ plain_text: "2026-2" }] },
      "학기 내 순서": { type: "number", number: n },
      분류: { type: "select", select: { name: "기업분석", color: "green" } },
      요약: { type: "rich_text", rich_text: [{ plain_text: "Not Rated · 원래 요약은 모두 보존" }] },
      "외부 링크": { type: "url", url: `https://drive.google.com/file/d/shared_pdf_012345/view` },
    },
  }
}
function snapshot(pages = [page()]): Snapshot {
  return { capturedAt: time, sources: { research: pages, notice: [], members: [] }, noticeBodies: {}, publication: [] }
}
function prepared(p = page()): PublicationRow {
  return {
    id: p.id.replaceAll("-", ""), kind: "research", revision: time, body_revision: time,
    item: JSON.stringify(toContentItem(p, "research", Date.parse(time))), blocks: "[]",
    cover: JSON.stringify({ url: "/report-covers/cover.webp", pdfHash: "a".repeat(64), reader: {
      source: { bytes: 400 }, pageCount: 12, pagePack: { bytes: 1000, url: "/report-covers/pack.bin" },
    } }),
  }
}

test("migration preserves legacy URLs, category colors, original fields and report order without approval", () => {
  const a = page(1), b = page(2)
  a.properties["학기 내 순서"].number = 2
  b.properties["학기 내 순서"].number = 1
  const plan = createMigrationPlan(snapshot([a, b]))
  assert.deepEqual(plan.reportOrder, [compact(2), compact(1)])
  assert.equal(plan.cutoverAllowed, false)
  assert.equal(plan.records[0].legacyPublicId, compact(1))
  assert.equal(plan.records[0].normalized.categoryColor, "green")
  assert.equal(plan.records[0].normalized.activity, "정규 세션")
  assert.equal(plan.records[0].normalized.summary, "Not Rated · 원래 요약은 모두 보존")
  assert.deepEqual(plan.records[0].source, a)
  assert.ok(plan.records.every(r => r.state === "review-only"))
  assert.equal(plan.sharedAssets.length, 1)
  assert.ok(plan.issues.some(i => i.code === "legacy-url-map"))
})

test("private and scheduled content is retained without becoming public", () => {
  const privatePage = page(1, false), scheduled = page(2)
  scheduled.properties.게시일.date = { start: "2027-01-01" }
  const plan = createMigrationPlan(snapshot([privatePage, scheduled]))
  assert.deepEqual(plan.records.map(r => r.effectivePublished), [false, false])
  assert.deepEqual(plan.records.map(r => r.sourcePublished), [false, true])
  assert.equal(plan.records[0].normalized.title, "시험 리포트")
  assert.equal(plan.records[1].normalized.date, "2027-01-01")
  assert.deepEqual(plan.reportOrder, [])
})

test("nested notice tables, formatting and expiring attachments are retained and flagged", () => {
  const s = snapshot([]), notice = page(3, false)
  s.sources.notice = [notice]
  const table = { id: "table", type: "table", table: { has_column_header: true }, children: [
    { id: "row", type: "table_row", table_row: { cells: [[{ text: { content: "보존할 표" }, annotations: { bold: true } }]] } },
  ] }
  const pdf = { id: "file", type: "pdf", pdf: { file: { url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/file.pdf?signature=expiring" } } }
  s.noticeBodies[compact(3)] = [table, pdf]
  const plan = createMigrationPlan(s)
  assert.deepEqual(plan.records[0].body, [table, pdf])
  assert.equal(plan.noticeAnnotations.bold, 1)
  for (const code of ["notice-editor-gap", "notice-inline-formatting", "expiring-source-assets"])
    assert.ok(plan.issues.some(i => i.code === code), code)
  delete s.noticeBodies[compact(3)]
  assert.equal(createMigrationPlan(s).stats.missingNoticeBodies, 1)
})

test("Drive view and download URLs share one identity; only exact hosts are accepted", () => {
  const view = assetReference("https://drive.google.com/file/d/shared_pdf_012345/view", "attachment")
  const download = assetReference("https://drive.usercontent.google.com/download?id=shared_pdf_012345&export=download", "pdf-original")
  assert.equal(view.key, download.key)
  assert.equal(assetReference("https://drive.usercontent.google.com.example.org/download?id=shared_pdf_012345", "pdf").provider, "external")
  assert.equal(assetReference("https://user:password@drive.usercontent.google.com/download?id=shared_pdf_012345", "pdf").provider, "external")
})

test("private members retain their profile and roles without becoming published", () => {
  const s = snapshot([]), member = page(5, false)
  member.parent = { type: "data_source_id", data_source_id: id(99) }
  member.properties.이름 = { type: "title", title: [{ plain_text: "테스트 회원" }] }
  member.properties.기수 = { type: "number", number: 40 }
  member.properties.구분 = { type: "multi_select", multi_select: [{ name: "MEMBERS" }, { name: "회장" }] }
  s.sources.members = [member]
  const record = createMigrationPlan(s).records[0]
  assert.equal(record.effectivePublished, false)
  assert.equal(record.normalized.generation, 40)
  assert.deepEqual(record.normalized.roles, ["회장"])
})

test("public version drift prevents cover reuse and reports missing public source rows", () => {
  const s = snapshot(), row = prepared()
  s.publication = [row]
  assert.equal(createMigrationPlan(s).stats.reusableCovers, 1)
  s.sources.research[0].last_edited_time = "2026-10-26T03:01:00.000Z"
  const drift = createMigrationPlan(s)
  assert.equal(drift.stats.reusableCovers, 0)
  assert.ok(drift.issues.some(i => i.code === "source-revision-drift"))
  s.sources.research = []
  assert.ok(createMigrationPlan(s).issues.some(i => i.code === "unmatched-public-record"))
})

test("rehearsal is idempotent, updates prepared assets and never deletes rows absent from a snapshot", () => {
  const db = new DatabaseSync(":memory:")
  try {
    const s = snapshot([page(1), page(2)])
    s.publication = [prepared()]
    const plan = createMigrationPlan(s)
    assert.equal(stagePlan(db, plan).inserted, 2)
    assert.equal(stagePlan(db, plan).unchanged, 2)
    s.publication[0].cover = JSON.stringify({ url: "/report-covers/new.webp" })
    assert.equal(stagePlan(db, createMigrationPlan(s)).updated, 1)
    const older = structuredClone(s)
    older.sources.research[0].last_edited_time = "2026-10-25T03:00:00.000Z"
    assert.equal(stagePlan(db, createMigrationPlan(older)).olderSkipped, 1)
    assert.equal(stagePlan(db, createMigrationPlan(snapshot([]))).total, 2)
    assert.equal(db.prepare("SELECT count(*) AS n FROM migration_records WHERE state<>'review-only'").get()!.n, 0)
  } finally { db.close() }
})

test("rehearsal retains all attachment roles while recording shared asset references", () => {
  const s = snapshot([page(1), page(2)])
  s.sources.research[0].properties.첨부파일 = { type: "files", files: [
    { name: "sample.pdf", external: { url: "https://drive.google.com/file/d/shared_pdf_012345/view" } },
  ] }
  const db = new DatabaseSync(":memory:")
  try {
    stagePlan(db, createMigrationPlan(s))
    const rows = db.prepare("SELECT DISTINCT role FROM migration_asset_refs WHERE source_key=? ORDER BY role").all(`notion:research:${compact(1)}`)
    assert.deepEqual(rows.map(r => r.role), ["attachment", "pdf-original"])
    assert.equal(db.prepare("SELECT count(DISTINCT source_key) AS n FROM migration_asset_refs WHERE asset_key=?").get("drive:shared_pdf_012345")!.n, 2)
  } finally { db.close() }
})

test("failed staging rolls back the entire batch; modified or publishing plans fail closed", () => {
  const db = new DatabaseSync(":memory:")
  try {
    db.exec(rehearsalSchema)
    db.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON migration_records WHEN NEW.legacy_public_id='${compact(2)}' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`)
    const plan = createMigrationPlan(snapshot([page(1), page(2)]))
    assert.throws(() => stagePlan(db, plan), /fixture failure/)
    assert.equal(db.prepare("SELECT count(*) AS n FROM migration_records").get()!.n, 0)
    assert.equal(db.prepare("SELECT count(*) AS n FROM migration_asset_refs").get()!.n, 0)
    const tampered = structuredClone(plan)
    tampered.records[0].normalized.title = "modified"
    assert.throws(() => stagePlan(db, tampered), /modified staged record/)
    assert.throws(() => stagePlan(db, { ...plan, cutoverAllowed: true }), /review-only/)
    assert.throws(() => createMigrationPlan(snapshot([page(1), page(1)])), /Repeated/)
    assert.throws(() => createMigrationPlan({ ...snapshot(), capturedAt: "invalid" }), /snapshot time/)
    const { snapshotHash, ...payload } = plan.records[0]
    assert.equal(snapshotHash, sha(payload))
  } finally { db.close() }
})

test("offline CLI validates checksums, protects source files and creates private idempotent output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "smp-migration-test-"))
  const output = root + "-output"
  try {
    const files: { file: string; bytes: number; sha256: string }[] = []
    for (const [name, data] of Object.entries({
      "research-pages.json": [page()], "notice-pages.json": [], "members-pages.json": [],
      "production-free_content.json": [prepared()],
      "notion-summary.json": { finishedAt: time, bodyErrors: [], sources: { research: { count: 1 }, notice: { count: 0 }, members: { count: 0 } } },
    })) {
      const bytes = Buffer.from(JSON.stringify(data))
      await writeFile(path.join(root, name), bytes)
      files.push({ file: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
    }
    await writeFile(path.join(root, "notion-snapshot-manifest.json"), JSON.stringify({ files: files.slice(0, 3).concat(files.slice(4)) }))
    await writeFile(path.join(root, "cloud-snapshot-manifest.json"), JSON.stringify({ files: [files[3]] }))
    const cwd = fileURLToPath(new URL("..", import.meta.url))
    const run = (out: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-cms-migration.mjs", "--snapshot", root, "--out", out], { cwd, encoding: "utf8" })
    const result = run(output)
    assert.equal(result.status, 0, result.stderr)
    const summary = JSON.parse(result.stdout)
    assert.equal(summary.first.inserted, 1)
    assert.equal(summary.repeat.unchanged, 1)
    assert.equal((await stat(output)).mode & 0o777, 0o700)
    assert.equal((await stat(path.join(output, "migration-plan.json"))).mode & 0o777, 0o600)
    assert.equal((await stat(path.join(output, "rehearsal.sqlite"))).mode & 0o777, 0o600)
    assert.equal(createHash("sha256").update(await readFile(path.join(root, files[0].file))).digest("hex"), files[0].sha256)
    assert.notEqual(run(output).status, 0, "must not overwrite a prior rehearsal")
    assert.match(run(path.join(root, "forbidden")).stderr, /outside the snapshot/)
    await symlink(cwd, path.join(root, "repo-link"), "dir")
    assert.match(run(path.join(root, "repo-link", "private-output")).stderr, /outside the snapshot/)
    await writeFile(path.join(root, "research-pages.json"), "[]")
    assert.match(run(output + "-invalid").stderr, /checksum mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(output, { recursive: true, force: true })
    await rm(output + "-invalid", { recursive: true, force: true })
  }
})
