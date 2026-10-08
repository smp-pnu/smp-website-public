import { test } from "node:test"
import assert from "node:assert/strict"
import { industryOptions, industrySector, matchesIndustry, canonicalIndustry, notionIndustry } from "../lib/wics"
import { pdfTickerCandidates, resolveReportIdentity } from "../lib/report-identity"
import { metadataInput, metadataKey, metadataNote, scopedReport } from "../lib/report-metadata-service"
import { selectContentPage } from "../lib/content-query"
import type { NotionPage, ContentItem } from "../lib/content-model"
const company = { ticker: "041830", company: "인바디", industry: "건강관리장비와용품" }
const renamed = { ticker: "060370", company: "LS마린솔루션", industry: "건설", aliases: ["KT서브마린"] }
const deps = { companies: [company, renamed], lookup: async (ticker: string) => [company, renamed].find(row => row.ticker === ticker) ?? null,
  readPdf: async () => { throw new Error("Unneeded PDF download") } }

test("WICS names map deterministically, including Notion's comma-safe names", () => {
  assert.equal(industrySector("전기장비"), "산업재")
  assert.equal(industrySector("전기제품"), "IT")
  assert.equal(industrySector("게임엔터테인먼트"), "커뮤니케이션서비스")
  assert.equal(industrySector("없는 업종"), undefined)
  assert.equal(canonicalIndustry("디스플레이장비및부품"), "디스플레이 장비 및 부품")
  assert.equal(canonicalIndustry(notionIndustry("호텔,레스토랑,레저")), "호텔,레스토랑,레저")
  assert.ok(matchesIndustry("건강관리장비와용품", "건강관리"))
  assert.ok(!matchesIndustry("소프트웨어", "산업재"))
  assert.deepEqual(industryOptions(["전기제품", "전기장비"]).map(item => item.value), ["산업재", "전기장비", "IT", "전기제품"])
})

test("known company and former name fill an identity without downloading the PDF", async () => {
  assert.equal((await resolveReportIdentity({ title: "[인바디] 성장" }, deps)).record?.ticker, "041830")
  assert.equal((await resolveReportIdentity({ title: "[KT서브마린] 리포트" }, deps)).record?.company, "LS마린솔루션")
  assert.equal((await resolveReportIdentity({ title: "[인바디]", ticker: "060370" }, deps)).record, null)
})

test("PDF fallback rejects prices, multiple companies, and conflicting real tickers", async () => {
  assert.deepEqual(pdfTickerCandidates("현재주가 100000 목표주가 200000 202610"), [])
  const pdfDeps = { ...deps, companies: [], readPdf: async () => "인바디 (041830)\n기업분석" }
  assert.equal((await resolveReportIdentity({ title: "기업분석" }, pdfDeps)).record?.ticker, "041830")
  assert.equal((await resolveReportIdentity({ title: "[다른회사] 분석" }, pdfDeps)).record, null)
  assert.equal((await resolveReportIdentity({ title: "분석" }, { ...pdfDeps, readPdf: async () => "인바디 (041830)\nLS마린솔루션 (060370)" })).record, null)
  assert.equal((await resolveReportIdentity({ title: "분석", category: "산업분석" }, deps)).record, null)
})

test("metadata fingerprints ignore rotating URLs, preserve notes and check database boundaries", () => {
  const page: NotionPage = { id: "1".repeat(32), object: "page", created_time: "2026-01-01", parent: { type: "data_source_id", data_source_id: "2".repeat(32) }, properties: {
    제목: { type: "title", title: [{ plain_text: "[인바디] 보고서" }] },
    첨부파일: { type: "files", files: [{ name: "report.pdf", file: { url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/report.pdf?signature=one" } }] },
  } }
  const key = metadataKey(metadataInput(page))
  page.properties.첨부파일.files![0].file!.url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/report.pdf?signature=two"
  assert.equal(metadataKey(metadataInput(page)), key)
  page.properties.기업명 = { type: "rich_text", rich_text: [{ plain_text: "인바디" }] }
  assert.notEqual(metadataKey(metadataInput(page)), key)
  assert.equal(metadataNote("원래 메모\n[기업정보] 이전 결과", "새 결과"), "원래 메모\n[기업정보] 새 결과")
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = "2".repeat(32)
  assert.ok(scopedReport(page, page.id))
  assert.ok(!scopedReport({ ...page, archived: true }, page.id))
  assert.ok(!scopedReport({ ...page, parent: { type: "page_id" } }, page.id))
})

test("sector selection and ticker search use the same catalog and preserve result order", () => {
  const base: ContentItem = { id: "1", kind: "research", title: "새 리포트", summary: "", date: "2026-01-01", category: "기업분석", author: "SMP", pinned: false, attachments: [], externalUrl: null }
  const rows = [{ ...base, ticker: "041830", company: "인바디", industry: "건강관리장비와용품" }, { ...base, id: "2", industry: "제약" }, { ...base, id: "3", industry: "화장품" }]
  assert.deepEqual(selectContentPage(rows, "research", { industry: "건강관리" }).visibleItems, rows.slice(0, 2))
  assert.deepEqual(selectContentPage(rows, "research", { q: "041830" }).visibleItems, [rows[0]])
  assert.deepEqual(selectContentPage(rows, "research", { q: "건강관리" }).visibleItems, rows.slice(0, 2))
})

test("metadata sync fills only empty allowed fields, then ignores its own repeated webhook", async () => {
  const { syncReportMetadata } = await import("../lib/report-metadata-service")
  const nativeFetch = globalThis.fetch
  const oldEnabled = process.env.NOTION_METADATA_WRITE_ENABLED
  const oldSource = process.env.NOTION_REPORTS_DATA_SOURCE_ID
  process.env.NOTION_METADATA_WRITE_ENABLED = "true"
  process.env.NOTION_REPORTS_DATA_SOURCE_ID = "2".repeat(32)
  const text = (value: string) => ({ type: "rich_text", rich_text: [{ plain_text: value, text: { content: value } }] })
  const page: NotionPage = { id: "3".repeat(32), object: "page", created_time: "2026-01-01", parent: { type: "data_source_id", data_source_id: "2".repeat(32) }, properties: {
    제목: { type: "title", title: [{ plain_text: "[인바디] 새 리포트" }] },
    기업명: { type: "rich_text", rich_text: [] }, 종목코드: { type: "rich_text", rich_text: [] },
    업종: { type: "select", select: { name: "건강관리" } },
    "기업정보 상태": { type: "select", select: null }, "기업정보 동기화키": { type: "rich_text", rich_text: [] },
    "검토 메모": text("관리자 메모"),
    "외부 링크": { type: "url", url: "https://drive.google.com/file/d/test-report-pdf/view" },
    공개: { type: "checkbox", checkbox: false },
  } }
  const writes: Record<string, unknown>[] = []
  let lookups = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://navercomp.wisereport.co.kr/")) { lookups++; return new Response('<span class="name">인바디</span><dt>WICS : 건강관리장비와용품</dt>') }
    assert.ok(String(url).startsWith("https://api.notion.com/v1/pages/"))
    if (init?.method === "PATCH") {
      const update = JSON.parse(String(init.body)).properties
      writes.push(update)
      for (const [key, value] of Object.entries(update)) page.properties[key] = { ...page.properties[key], ...value as object }
    }
    return Response.json(page)
  }
  try {
    assert.equal(await syncReportMetadata(page.id), "자동 입력")
    assert.equal(await syncReportMetadata(page.id), "unchanged")
    assert.equal(writes.length, 1)
    assert.equal(lookups, 1)
    assert.deepEqual(Object.keys(writes[0]).sort(), ["기업정보 상태", "기업정보 동기화키", "검토 메모", "기업명", "종목코드"].sort())
    assert.equal(page.properties.업종.select?.name, "건강관리")
    assert.equal(page.properties.공개.checkbox, false)
    assert.equal(page.properties.종목코드.rich_text?.[0].text?.content, "041830")
    page.parent = { type: "data_source_id", data_source_id: "9".repeat(32) }
    assert.equal(await syncReportMetadata(page.id), "ignored")
    assert.equal(writes.length, 1)
  } finally {
    globalThis.fetch = nativeFetch
    if (oldEnabled === undefined) delete process.env.NOTION_METADATA_WRITE_ENABLED; else process.env.NOTION_METADATA_WRITE_ENABLED = oldEnabled
    if (oldSource === undefined) delete process.env.NOTION_REPORTS_DATA_SOURCE_ID; else process.env.NOTION_REPORTS_DATA_SOURCE_ID = oldSource
  }
})
