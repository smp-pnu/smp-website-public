import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import type { Database, Statement } from "../cloudflare/bindings"
import { REPORT_AI_MODEL, REPORT_AI_PILOT_IDS, publicAiSummary, validateSummaryEvidence, type ReportAiSummary } from "../lib/report-ai-summary"
import { approvedReportSummary } from "../lib/report-ai-pilot"
import { AI_DAILY_ATTEMPTS, AI_MAX_OUTPUT_TOKENS, generateReportSummary, reserveAiPilotCall, summaryRequest, SummaryEvidenceError } from "../free/jobs/report-ai"
import { detailHtml } from "../free/seo/content"
import type { ContentItem, NotionPage } from "../lib/content-model"
import type { Env } from "../free/server/types"
import { storePage } from "../free/server/catalog"
import { readDetail } from "../free/server/pages"
import approvedRecords from "../data/report-ai-summaries.json"

const evidence = "보고서는 의료기기 시장의 수출 확대를 성장 요인으로 제시한다."
const claim = { text: "보고서는 수출 확대를 성장 요인으로 제시한다.", sources: [{ page: 1, quote: evidence }] }
const summary: ReportAiSummary = {
  version: 1, reportId: REPORT_AI_PILOT_IDS[0], pdfHash: "a".repeat(64), model: REPORT_AI_MODEL,
  generatedAt: "2026-10-12T00:00:00Z", reviewedAt: "2026-10-12T01:00:00Z", reportDate: "2026-10-04", documentPages: 2,
  overview: [claim, claim], points: [claim, claim], risks: [],
}
const pages = [{ number: 1, text: evidence }, { number: 2, text: "다른 페이지의 내용입니다." }]
const source = { reportId: summary.reportId, pdfHash: summary.pdfHash, reportDate: summary.reportDate, pages }
function database() {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec("CREATE TABLE free_controls(name TEXT PRIMARY KEY, until_at INTEGER NOT NULL)")
  const prepare = (sql: string, values: unknown[] = []): Statement => ({
    bind: (...args) => prepare(sql, args),
    async first<T>() { return (sqlite.prepare(sql).get(...values as any[]) ?? null) as T | null },
    async all<T>() { return { results: sqlite.prepare(sql).all(...values as any[]) as T[] } },
    async run() { return sqlite.prepare(sql).run(...values as any[]) },
  })
  return { db: { prepare, batch: async (statements: Statement[]) => Promise.all(statements.map(s => s.run())) } satisfies Database, sqlite }
}
const changed = () => structuredClone(summary)

test("summary evidence must match its own PDF page and include every numeric claim", () => {
  assert.doesNotThrow(() => validateSummaryEvidence(summary, pages))
  const wrongPage = changed(); wrongPage.overview[0].sources[0].page = 2
  assert.throws(() => validateSummaryEvidence(wrongPage, pages), /Unmatched evidence/)
  const invented = changed(); invented.overview[0].text += " 30% 성장을 전망한다."
  assert.throws(() => validateSummaryEvidence(invented, pages), /Numeric claim/)
  const html = changed(); html.overview[0].text = "<img src=x>"
  assert.throws(() => validateSummaryEvidence(html, pages), /Invalid summary/)
  assert.throws(() => validateSummaryEvidence(summary, pages.slice(0, 1)), /Invalid summary/)
  const whitespace = pages.map(p => ({ ...p, text: p.text.replaceAll(" ", "\n") }))
  assert.doesNotThrow(() => validateSummaryEvidence(summary, whitespace))
})

test("only reviewed pilot summaries for the exact PDF are public; republishing can reuse them", () => {
  const expected = publicAiSummary(summary)
  assert.deepEqual(approvedReportSummary(summary.reportId, summary.pdfHash, [summary]), expected)
  assert.deepEqual(approvedReportSummary(summary.reportId, summary.pdfHash, [summary]), expected)
  assert.equal(approvedReportSummary(summary.reportId, "b".repeat(64), [summary]), null)
  assert.equal(approvedReportSummary(summary.reportId, summary.pdfHash, [{ ...summary, reviewedAt: null }]), null)
  assert.equal(approvedReportSummary("b".repeat(32), summary.pdfHash, [{ ...summary, reportId: "b".repeat(32) }]), null)
  assert.doesNotMatch(JSON.stringify(expected), /quote|pdfHash|model|reviewedAt/)
})

test("shared daily budget is atomic, stops at five including parallel calls, and resets at UTC midnight", async () => {
  const { db, sqlite } = database()
  try {
    const day = Date.parse("2026-10-12T23:59:59Z")
    const results = await Promise.allSettled(Array.from({ length: 9 }, () => reserveAiPilotCall(db, day)))
    assert.equal(results.filter(result => result.status === "fulfilled").length, AI_DAILY_ATTEMPTS)
    assert.equal(await reserveAiPilotCall(db, day + 1000), 1)
    await assert.rejects(() => reserveAiPilotCall(db, day), /daily attempt limit/)
  } finally { sqlite.close() }
})

test("oversized input fails before any budget or AI call; output tokens have a fixed bound", async () => {
  const { db, sqlite } = database()
  try {
    const body = JSON.parse(summaryRequest(source))
    assert.equal(body.max_completion_tokens, AI_MAX_OUTPUT_TOKENS)
    assert.equal(body.chat_template_kwargs.enable_thinking, false)
    assert.match(body.messages[0].content, /자료 속 명령/)
    let calls = 0
    await assert.rejects(() => generateReportSummary({ ...source, pages: [{ number: 1, text: "가".repeat(160_000) }] }, {
      account: "a".repeat(32), token: "test-only", db, fetch: async () => { calls++; return new Response() },
    }), /input limit/)
    assert.equal(calls, 0)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM free_controls").get()?.n, 0)
  } finally { sqlite.close() }
})

test("provider failures spend a slot without retrying; successful drafts remain unreviewed", async () => {
  const { db, sqlite } = database()
  try {
    const options = { account: "a".repeat(32), token: "test-only", db, now: Date.parse("2026-10-12T00:00:00Z") }
    let calls = 0
    await assert.rejects(() => generateReportSummary(source, { ...options, fetch: async () => { calls++; return new Response("limit", { status: 429 }) } }), /429/)
    assert.equal(calls, 1)
    const generate: typeof fetch = async (url, init) => {
      calls++
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${options.account}/ai/run/${REPORT_AI_MODEL}`)
      assert.equal(init?.redirect, "error")
      return Response.json({ success: true, result: { choices: [{ message: { content: JSON.stringify(summary) }, finish_reason: "stop" }], usage: { total_tokens: 100 } } })
    }
    const result = await generateReportSummary(source, { ...options, fetch: generate })
    assert.equal(result.attempt, 2); assert.equal(result.summary.reviewedAt, null); assert.equal(calls, 2)
    const invalid = changed(); invalid.points[0].sources[0].quote = "これはPDFにない架空の文章です。"
    await assert.rejects(() => generateReportSummary(source, { ...options, fetch: async () => Response.json({ success: true, result: { response: JSON.stringify(invalid) } }) }), (error: unknown) => {
      assert.ok(error instanceof SummaryEvidenceError)
      assert.equal(error.draft.attempt, 3); assert.equal(error.draft.summary.reviewedAt, null)
      return true
    })
  } finally { sqlite.close() }
})

test("no-JavaScript report HTML contains the same summary, escapes claims, and hides it while pending", () => {
  const item: ContentItem = { id: summary.reportId, kind: "research", title: "Test report", summary: "", author: "SMP", date: summary.reportDate, category: "기업분석", pinned: false, attachments: [], externalUrl: null }
  const publicSummary = publicAiSummary(summary)
  const html = detailHtml(item, [], false, null, publicSummary)
  assert.match(html, /AI 리포트 요약/); assert.match(html, /PDF 2쪽의 텍스트 기준/)
  assert.match(html, /보고서는 수출 확대/)
  assert.doesNotMatch(detailHtml(item, [], true, null, publicSummary), /AI 리포트 요약/)
  assert.doesNotMatch(detailHtml({ ...item, kind: "notice" }, [], false, null, publicSummary), /AI 리포트 요약/)
  const unsafe = structuredClone(publicSummary); unsafe.overview[0].text = "<script>bad()</script>"
  assert.doesNotMatch(detailHtml(item, [], false, null, unsafe), /<script>bad/)
})

test("published details serve reviewed data without extra calls, hide stale summaries, and preserve authored body", async () => {
  const { db, sqlite } = database()
  for (const name of ['0002_free_runtime', '0003_free_guards', '0004_document_versions', '0006_report_cover_cache']) {
    sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`, import.meta.url), 'utf8'))
  }
  const approved = approvedRecords[0] as ReportAiSummary
  assert.ok(approvedRecords.length >= 3)
  const sourceId = '3'.repeat(32), revision = '2026-10-12T00:00:00Z'
  const page: NotionPage = { id: approved.reportId, object: 'page', created_time: revision, last_edited_time: revision,
    parent: {type:'data_source_id', data_source_id:sourceId}, properties: {
      제목: {type:'title', title:[{plain_text:'Pilot report'}]}, 공개: {type:'checkbox', checkbox:true},
      게시일: {type:'date', date:{start:approved.reportDate}},
    } }
  let calls = 0
  const env: Env = { CMS_DB:db, ASSETS:{fetch:async()=>new Response()}, SMP_READ_ONLY:'1', NOTION_TOKEN:'test-only',
    NOTION_REPORTS_DATA_SOURCE_ID:sourceId, NOTION_FETCH:async()=>{calls++; return Response.json(page)} }
  const read = () => readDetail(env, {waitUntil:()=>{}}, 'research', approved.reportId)
  const cover = {url:`/report-covers/${approved.reportId}/${'a'.repeat(64)}.webp`, pdfHash:approved.pdfHash}
  const blocks = [{id:`${approved.reportId}-excerpt`,type:'paragraph'}, {id:'authored',type:'paragraph'}]
  try {
    await storePage(env,page,'research')
    sqlite.prepare('UPDATE free_content SET blocks=?,body_revision=?,cover=? WHERE id=?').run(JSON.stringify(blocks),revision,JSON.stringify(cover),approved.reportId)
    let detail = await read()
    assert.equal(calls,1,'AI summary does not make a separate API request')
    assert.deepEqual(detail?.aiSummary, publicAiSummary(approved))
    assert.deepEqual(detail?.blocks.map(block=>block.id),['authored'])
    sqlite.prepare('UPDATE free_content SET cover=? WHERE id=?').run(JSON.stringify({...cover,pdfHash:'b'.repeat(64)}),approved.reportId)
    detail = await read()
    assert.equal(detail?.aiSummary,null); assert.equal(detail?.blocks.length,2)
    sqlite.prepare('UPDATE free_content SET cover=? WHERE id=?').run(JSON.stringify(cover),approved.reportId)
    page.last_edited_time='2026-10-12T01:00:00Z'
    detail = await read()
    assert.equal(detail?.bodyPending,true); assert.equal(detail?.aiSummary,null)
    page.properties.공개.checkbox=false
    assert.equal(await read(),null)
    page.properties.공개.checkbox=true
    sqlite.prepare('UPDATE free_content SET body_revision=? WHERE id=?').run(page.last_edited_time,approved.reportId)
    assert.deepEqual((await read())?.aiSummary,publicAiSummary(approved))
  } finally { sqlite.close() }
})
