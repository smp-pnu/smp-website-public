import assert from "node:assert/strict"
import { test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import { readFile } from "node:fs/promises"
import type { Database, Statement } from "../cloudflare/bindings"
import { extractMetadata, metadataModel, metadataPrompt, metadataPromptLimit, metadataDailyLimit } from "../admin-cloud/ai-metadata"
import { aiPages, validateAiCandidates, mergeAiFields } from "../admin-lab/ai-fields"
import { emptyFields } from "../admin-lab/model"
import { prefillAi } from "../admin-lab/ai-prefill"

const page = "Equity Research 2026.02.26\n티씨케이 (KQ.064670)\nNAND 호황기가 눈앞\n목표주가 335,500원\n현재주가 238,500원\nUpside 41%\nSRS 38th Research Team 1\ncontact@example.com 010-1234-5678"
const quote = (value: string, source: string) => ({ value, quote: source, page: 1 })
const output = { company: quote("티씨케이", "티씨케이 (KQ.064670)"), ticker: quote("064670", "티씨케이 (KQ.064670)"), title: quote("NAND 호황기가 눈앞", "NAND 호황기가 눈앞"), date: quote("2026-02-26", "Equity Research 2026.02.26"), targetPrice: quote("335,500원", "목표주가 335,500원"), upside: quote("41%", "Upside 41%") }
const input = { reviewed: true, hash: "a".repeat(64), pages: aiPages([page]) }
async function database() {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(await readFile(new URL("../admin-cloud/schema.sql", import.meta.url), "utf8"))
  const db: Database = { prepare(sql) {
    let params: unknown[] = []
    const statement: Statement = { bind(...args) { params = args; return statement },
      async first<T>() { return (sqlite.prepare(sql).get(...params as never[]) as T) ?? null },
      async all<T>() { return { results: sqlite.prepare(sql).all(...params as never[]) as T[] } },
      async run() { return sqlite.prepare(sql).run(...params as never[]) } }
    return statement
  }, async batch(statements) { return Promise.all(statements.map(s => s.run())) } }
  return { db, sqlite }
}

test("AI extraction grounds TCK's market-prefixed ticker, date, headline and prices in source quotes", () => {
  const candidates = validateAiCandidates(output, [page])
  assert.equal(candidates.length, 6)
  const result = mergeAiFields({ fields: { ...emptyFields(), title: "SRS 티씨케이" }, evidence: [], warnings: [] }, candidates, "SRS_티씨케이.pdf")
  assert.equal(result.fields.company, "티씨케이"); assert.equal(result.fields.ticker, "064670")
  assert.equal(result.fields.title, "NAND 호황기가 눈앞"); assert.equal(result.fields.date, "2026-02-26")
  assert.equal(result.fields.targetPrice, "335,500원"); assert.equal(result.fields.upside, "41%")
  assert.equal(result.fields.semester, ""); assert.equal(result.fields.targetYear, "")
  assert.equal(result.evidence.length, 6)
})
test("unsourced values, current prices, malformed dates and mismatched company/ticker pairs are rejected", () => {
  assert.deepEqual(validateAiCandidates({ company: quote("삼성전자", "티씨케이 (KQ.064670)"), ticker: quote("005930", "티씨케이 (KQ.064670)") }, [page]), [])
  assert.deepEqual(validateAiCandidates({ targetPrice: quote("238,500원", "현재주가 238,500원"), date: quote("2026-02-31", "Equity Research 2026.02.26"), targetYear: quote("2026", "Equity Research 2026.02.26"), notRated: quote("Not Rated", "목표주가 335,500원") }, [page]), [])
  assert.equal(validateAiCandidates({ company: quote("티씨케이", "티씨케이"), ticker: quote("238500", "238500") }, [page + " 238500"]).length, 0)
  assert.deepEqual(validateAiCandidates({ targetPrice: quote("33,550원", "목표주가 335,500원") }, [page]), [])
  assert.deepEqual(validateAiCandidates({ targetPrice: quote("238,500원", "목표주가 335,500원\n현재주가 238,500원") }, [page]), [])
  assert.deepEqual(validateAiCandidates({ upside: quote("1%", "Upside 41%") }, [page]), [])
  const preserved = mergeAiFields({ fields: { ...emptyFields(), title: "직접 정한 제목", company: "인바디", ticker: "041830", targetPrice: "80,000원" }, evidence: [], warnings: [] }, validateAiCandidates(output, [page]), "test.pdf")
  assert.equal(preserved.fields.title, "직접 정한 제목"); assert.equal(preserved.fields.company, "인바디")
  assert.equal(preserved.fields.ticker, "041830"); assert.equal(preserved.fields.targetPrice, "80,000원")
  assert.ok(preserved.warnings.length)
  const nr = mergeAiFields({ fields: { ...emptyFields(), upside: "20%" }, evidence: [], warnings: [] }, validateAiCandidates({notRated:quote("Not Rated", "Not Rated")}, ["Not Rated"]), "test.pdf")
  assert.equal(nr.fields.notRated, true); assert.equal(nr.fields.upside, "")
})
test("AI input strips contact details, bounds text and keeps conservative token cost below the free allocation", () => {
  assert.doesNotMatch(aiPages([page]).join(""), /contact@example.com|010-1234-5678/)
  assert.ok(new TextEncoder().encode(aiPages(["가".repeat(10000), "나".repeat(10000)]).join("")).length <= 12000)
  assert.ok(new TextEncoder().encode(JSON.stringify(metadataPrompt(aiPages(["가".repeat(10000)])))) .length < metadataPromptLimit)
  // Official rate: 26668 input / 204805 output neurons per million tokens.
  const worstDaily = metadataDailyLimit * (metadataPromptLimit * 26668 + 1200 * 204805) / 1_000_000
  assert.ok(worstDaily < 8000)
})
test("AI result cache avoids repeated calls and never stores the full source text", async () => {
  const { db, sqlite } = await database(); let calls = 0
  try {
    const ai = { async run(model: string) { assert.equal(model, metadataModel); calls++; return { response: output } } }
    const a = await extractMetadata(input, db, ai, 100000), b = await extractMetadata(input, db, ai, 100001)
    assert.equal(a.candidates.length, 6); assert.equal(b.cached, true); assert.equal(calls, 1)
    const cached = JSON.stringify(sqlite.prepare("SELECT * FROM metadata_extractions").all())
    assert.doesNotMatch(cached, /contact@example.com|현재주가/)
  } finally { sqlite.close() }
})
test("AI claims prevent simultaneous duplicate calls; failures consume a slot but never block PDF registration", async () => {
  const { db, sqlite } = await database()
  try {
    let started!: () => void, complete!: (value: unknown) => void, calls = 0
    const active = new Promise<void>(resolve => { started = resolve })
    const pending = extractMetadata(input, db, { run() { calls++; started(); return new Promise(resolve => { complete = resolve }) } }, 100000)
    await active
    const duplicate = await extractMetadata(input, db, { async run() { throw Error("must not run") } }, 100001)
    assert.equal(duplicate.candidates.length, 0); complete({ response: output }); await pending
    assert.equal(calls, 1)
    const failed = await extractMetadata({ ...input, hash: "b".repeat(64) }, db, { async run() { throw Error("provider unavailable") } }, 100002)
    assert.ok(failed.warning); assert.equal(sqlite.prepare("SELECT hits FROM usage WHERE key='metadata-day:0'").get()!.hits, 2)
  } finally { sqlite.close() }
})
test("AI daily ceiling counts errors and concurrent requests and cached results remain usable", async () => {
  const { db, sqlite } = await database(); let calls = 0
  try {
    const ai = { async run() { calls++; return { response: output } } }
    await Promise.all(Array.from({ length: 15 }, (_, i) => extractMetadata({ ...input, hash: i.toString(16).padStart(64, "0") }, db, ai, 100000)))
    assert.equal(calls, 10)
    const over = await extractMetadata(input, db, ai, 100001)
    assert.match(over.warning!, /10건/); assert.equal(calls, 10)
    assert.ok((await extractMetadata({ ...input, hash: "0".repeat(64) }, db, ai, 100002)).cached)
    await assert.rejects(extractMetadata({ ...input, pages: ["x".repeat(12001)] }, db, ai), /요청|용량/)
    assert.equal(calls, 10)
  } finally { sqlite.close() }
})
test("client keeps PDF and rule-based fields when AI is unavailable or returns invented evidence", async t => {
  const base = { fields: emptyFields(), evidence: [], warnings: [], sourcePages: [page], cover: new Blob(["cover"]), pages: 39 }
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Load failed") })
  const result = await prefillAi(base, input.hash, "test.pdf", new AbortController().signal, () => {}, async () => true)
  assert.equal(result.cover, base.cover); assert.equal(result.pages, 39); assert.ok(result.warnings.length)
  t.mock.method(globalThis, "fetch", async () => Response.json({ candidates: [{ field: "ticker", value: "005930", quote: "Samsung (005930)", page: 1 }] }))
  const forged = await prefillAi(base, input.hash, "test.pdf", new AbortController().signal, () => {}, async () => true)
  assert.equal(forged.fields.ticker, "")
})


test("AI contact masking covers compact, dotted and international phones without losing tickers", () => {
  const raw = "티씨케이 064670 · 01012345678 · 010.1234.5678 · +82 (0)10-1234-5678 · +1 415 555 0123 · 02 123 4567 · user@example.com"
  const clean = aiPages([raw]).join("")
  assert.match(clean,/064670/)
  assert.doesNotMatch(clean,/12345678|1234|555|example.com/)
})
test("AI opt-out performs no API request; server rejects missing review before database access", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw Error("must not send") }
  const base = {fields:emptyFields(), evidence:[], warnings:[], sourcePages:[page]}
  try {
    assert.equal(await prefillAi(base,input.hash,"test.pdf",new AbortController().signal,()=>{},async () => false),base)
    assert.equal(calls,0)
    const {db,sqlite} = await database()
    try { await assert.rejects(extractMetadata({...input,reviewed:false},db,{async run(){ calls++; return {} }}),/전송 내용을/);assert.equal(calls,0) }
    finally {sqlite.close()}
  } finally {globalThis.fetch=original}
})
