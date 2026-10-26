import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile } from "node:fs/promises"
import { approveDraft, checkCapacity, editDraft, emptyFields, limits, reportSummary, reviewErrors, statusOf, trashDraft, validDate, validateFile, type Draft } from "../admin-lab/model"
import { extractFields } from "../admin-lab/extract"
import { fingerprint } from "../admin-lab/pdf"
import { samplePdf } from "../admin-lab/sample"

const now = "2026-10-24T00:00:00Z"
function fixture(): Draft {
  return { id: "test", hash: "a".repeat(64), filename: "report.pdf", fileBytes: 100, storedBytes: 200, pages: 3,
    fields: { ...emptyFields(), title: "리포트", company: "인바디", ticker: "041830", date: "2026-10-20", semester: "2026-2", author: "R1", notRated: true },
    evidence: [], warnings: [], revision: 1, approvedRevision: null, approvedAt: null, updatedAt: now, createdAt: now, trashedAt: null }
}
test("admin lab validates actual PDF bytes and rejects misleading files before parsing", async () => {
  const signal = new AbortController().signal
  const a = await fingerprint(samplePdf(0), signal)
  const b = await fingerprint(new File([samplePdf(0)], "renamed.pdf", { type: "application/pdf" }), signal)
  assert.equal(a.hash, b.hash)
  assert.equal(a.hash.length, 64)
  await assert.rejects(fingerprint(new File(["<html>fake pdf</html>"], "fake.pdf", { type: "application/pdf" }), signal), /헤더/)
  assert.throws(() => validateFile({ name: "huge.pdf", size: limits.fileBytes + 1, type: "application/pdf" }), /32 MB/)
  assert.throws(() => validateFile({ name: "bad.html", size: 50, type: "text/html" }), /PDF 파일/)
  assert.throws(() => validateFile({ name: "empty.pdf", size: 0, type: "application/pdf" }), /비어/)
})
test("metadata extraction preserves evidence, leading zero tickers and uncertain fields", () => {
  const result = extractFields("[인바디] 새로운 기회.pdf", ["인바디 (041830)\n발표일: 2026.10.20\n목표주가: 35,000원\n상승여력: 25.5%\n타겟년도: 2027\n작성팀: 리서치 1팀"])
  assert.equal(result.fields.company, "인바디")
  assert.equal(result.fields.ticker, "041830")
  assert.equal(result.fields.date, "2026-10-20")
  assert.equal(result.fields.semester, "") // Do not infer an academic term from an arbitrary month.
  assert.equal(result.fields.targetPrice, "35,000원")
  assert.equal(result.fields.upside, "25.5%")
  assert.equal(result.evidence.find(item => item.field === "date")?.page, 1)
  const ambiguous = extractFields("새 리포트.pdf", ["주가 123456\n매출 041830\n2026.10.20"])
  assert.equal(ambiguous.fields.ticker, "")
  assert.equal(ambiguous.fields.date, "")
  assert.equal(ambiguous.fields.notRated, false) // Missing target is not an explicit rating.
  assert.ok(ambiguous.warnings.length)
})
test("conflicting companies, ratings and impossible dates remain review cases", () => {
  assert.equal(extractFields("[인바디] 분석.pdf", ["HPSP (403870)"]).fields.ticker, "")
  assert.equal(extractFields("산업분석.pdf", ["인바디 (041830)"]).fields.company, "")
  const conflict = extractFields("test.pdf", ["Target price: 50,000 KRW\nNot Rated"])
  assert.equal(conflict.fields.notRated, false)
  assert.ok(conflict.warnings.some(item => item.includes("함께")))
  assert.equal(extractFields("test.pdf", ["Date: 2026-02-31"]).fields.date, "")
  assert.equal(validDate("2026-02-31"), false)
  assert.equal(validDate("2024-02-29"), true)
})
test("fragmented PDF currency values are complete and report headers supply attributed candidates", () => {
  const result = extractFields("original.pdf", ["효성중공업 (298040 KOSPI)\n현재주가 2,679,000 원\n목표주가 4 , 555   , 000   원 으로\n상승\n여력 70 %\nTeam R3"])
  assert.equal(result.fields.targetPrice, "4,555,000   원")
  assert.equal(result.fields.upside, "70%")
  assert.equal(result.fields.author, "리서치 3팀")
  assert.equal(result.fields.title, "original")
  const title = extractFields("inbody-original.pdf", ["Company\nAnalysis 2026.09.27\n인바디 (041830)\n미국 의료시장 침투와 중국 채널 확장, 가정용까지 이어지는 성장\n목표주가 79 , 500 원"])
  assert.equal(title.fields.date, "2026-09-27")
  assert.equal(title.fields.targetPrice, "79,500 원")
  assert.match(title.fields.title, /^\[인바디\] 미국 의료시장/)
  assert.equal(extractFields("test.pdf", ["목표주가 4 , 55 , 000 원"]).fields.targetPrice, "")
  const team = extractFields("test.pdf", ["Team’s Opinion\nStock Price\nSRS 38th Research Team 1\nBUY"])
  assert.equal(team.fields.author, "SRS 38th Research Team 1")
  assert.equal(extractFields("test.pdf", ["Team's Opinion\nStock Price"]).fields.author, "")
})
test("approval requires manual review and complete fields; edits invalidate approval", () => {
  const original = fixture()
  assert.deepEqual(reviewErrors(original.fields), [])
  assert.throws(() => approveDraft(original, false, now), /확인/)
  assert.throws(() => approveDraft({ ...original, fields: emptyFields() }, true, now), /제목/)
  const approved = approveDraft(original, true, now)
  assert.equal(statusOf(approved), "시험 승인")
  const edited = editDraft(approved, { ...approved.fields, title: "수정본" }, now)
  assert.equal(statusOf(edited), "검토 대기")
  assert.equal(edited.revision, 2)
  assert.equal(edited.approvedAt, null)
  assert.equal(editDraft(approved, { ...approved.fields }, now), approved)
})
test("Not Rated clears conflicting values and trash/restore never restores old approval", () => {
  const approved = approveDraft(fixture(), true, now)
  const cleaned = editDraft(approved, { ...approved.fields, targetPrice: "50000원", upside: "25%" }, now)
  assert.equal(cleaned.fields.targetPrice, "")
  assert.equal(reportSummary(cleaned.fields), "Not Rated")
  const trash = trashDraft(approved, true, now)
  assert.throws(() => approveDraft(trash, true, now), /복원/)
  assert.equal(statusOf(trash), "휴지통")
  assert.equal(statusOf(trashDraft(trash, false, now)), "검토 대기")
})
test("capacity counts PDF, cover and trash; cannot exceed storage or record caps", () => {
  const trash = { ...fixture(), storedBytes: limits.totalBytes - 10, trashedAt: now }
  assert.throws(() => checkCapacity([trash], 11), /200 MB/)
  assert.doesNotThrow(() => checkCapacity([trash], 10))
  assert.throws(() => checkCapacity(Array.from({ length: limits.drafts }, fixture), 1), /50개/)
})
test("admin prototype is isolated from deployment, runtime routes and external connections", async () => {
  const config = await readFile(new URL("../admin-lab/vite.config.ts", import.meta.url), "utf8")
  assert.match(config, /envDir: false/)
  assert.match(config, /connect-src 'self' ws:\/\/127\.0\.0\.1:3012 ws:\/\/localhost:3012;/)
  assert.match(config, /host: "127\.0\.0\.1"/)
  const deployment = await readFile(new URL("../scripts/deploy-free.mjs", import.meta.url), "utf8")
  const production = await readFile(new URL("../free/server/worker.ts", import.meta.url), "utf8")
  assert.doesNotMatch(deployment + production, /admin-lab/)
  const script = await readFile(new URL("../scripts/admin-lab.mjs", import.meta.url), "utf8")
  assert.doesNotMatch(script, /wrangler|NOTION_TOKEN|CLOUDFLARE_API_TOKEN/)
})
