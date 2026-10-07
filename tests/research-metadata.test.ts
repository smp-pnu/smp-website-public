import { test } from "node:test"
import assert from "node:assert/strict"
import { toContentItem, type ContentItem, type NotionPage } from "../lib/content-model"
import { relatedResearch, reportActivity, reportCompany, reportType, researchFacts } from "../lib/research-metadata"
import { createContentSearchIndex, findContentMatches, selectContentPage } from "../lib/content-query"
import { contentDetailHref, contentReturnHref, normalizeContentSearch } from "../lib/content-navigation"

const base: ContentItem = { id: "1".repeat(32), kind: "research", title: "[인바디] 의료기기로", category: "기업분석", author: "R1", summary: "", date: "2026-10-01", pinned: false, attachments: [], externalUrl: null, semester: "2026-2" }

test("optional CMS metadata keeps old reports visible and preserves publication checks", () => {
  const page: NotionPage = { object: "page", id: base.id, created_time: "2026-01-01T00:00:00Z", properties: {
    제목: { type: "title", title: [{ plain_text: base.title }] }, 공개: { type: "checkbox", checkbox: true },
    게시일: { type: "date", date: { start: "2026-01-01" } },
  } }
  assert.equal(toContentItem(page, "research")?.title, base.title)
  page.properties.업종 = { type: "select", select: { name: "헬스케어" } }
  page.properties.종목코드 = { type: "rich_text", rich_text: [{ plain_text: "041830" }] }
  page.properties["투자 포인트"] = { type: "rich_text", rich_text: [{ plain_text: "첫째\n\n둘째\n셋째\n넷째" }] }
  const item = toContentItem(page, "research")!
  assert.equal(item.industry, "헬스케어")
  assert.equal(item.ticker, "041830")
  assert.deepEqual(item.investmentPoints, ["첫째", "둘째", "셋째"])
  assert.equal(toContentItem(page, "notice")?.industry, undefined)
  assert.equal(toContentItem({ ...page, in_trash: true }, "research"), null)
  page.properties.공개.checkbox = false
  assert.equal(toContentItem(page, "research"), null)
})

test("legacy category and titles provide conservative defaults without altering the title", () => {
  assert.equal(reportCompany(base), "인바디")
  assert.equal(reportCompany({ ...base, title: "[2026-2] 리포트" }), "")
  assert.equal(reportCompany({ ...base, title: "[반도체] 분석", category: "산업분석" }), "")
  assert.equal(reportCompany({ ...base, company: "직접 입력" }), "직접 입력")
  assert.equal(reportType(base), "기업분석")
  assert.equal(reportActivity(base), "정규 세션")
  assert.equal(reportActivity({ ...base, category: "부증련" }), "부증련")
  assert.equal(reportType({ ...base, reportType: "산업분석" }), "산업분석")
})

test("facts preserve source values and Not Rated never invents a target or upside", () => {
  assert.deepEqual(researchFacts("타겟년도: 2027년 · Target price: 79,500원 · 상승여력: 48.1%"), { targetYear: "2027년", targetPrice: "79,500원", upside: "48.1%", notRated: false })
  assert.deepEqual(researchFacts("타겟년도: 2025~2027년 · Not Rated"), { targetYear: "2025~2027년", targetPrice: undefined, upside: undefined, notRated: true })
  assert.equal(researchFacts("일반 소개 문구").targetPrice, undefined)
  assert.equal(researchFacts("타겟년도: 2015·2016년 · Target price: 25,000원 · 상승여력: 22.8%").targetYear, "2015·2016년")
})

test("all research filters are ANDed identically in suggestions and list, including ticker search", () => {
  const items = [
    { ...base, industry: "헬스케어", ticker: "041830" },
    { ...base, id: "2", industry: "헬스케어", semester: "2025-2" },
    { ...base, id: "3", industry: "소비재", ticker: "161890" },
    { ...base, id: "4", industry: "헬스케어", category: "신입세션" },
    { ...base, id: "5" },
  ]
  const search = { semester: "2026-2", industry: "헬스케어", reportType: "기업분석", activity: "정규 세션", view: "list" }
  const selected = selectContentPage(items, "research", search)
  assert.deepEqual(selected.visibleItems, [items[0]])
  assert.deepEqual(findContentMatches(createContentSearchIndex(items), "인바디", "", 6, search), selected.visibleItems)
  assert.equal(selectContentPage(items, "research", { q: "041830" }).visibleItems[0].id, base.id)
  assert.equal(selectContentPage(items, "research", {}).total, 5)
  assert.equal(selectContentPage(items, "notice", search).total, 5)
  const back = new URL(contentReturnHref(base, Object.fromEntries(new URL(contentDetailHref(base, { ...search, page: "2" }), "https://smp.test").searchParams)), "https://smp.test")
  for (const [key, value] of Object.entries(search)) assert.equal(back.searchParams.get(key), value)
  assert.equal(back.searchParams.get("page"), "2")
  assert.equal(back.hash, `#content-${base.id}`)
  assert.equal(normalizeContentSearch({ view: "unexpected", semester: "2026-9" }).view, undefined)
})

test("related reports prefer company then industry then semester, exclude self and respect catalog order", () => {
  const item = { ...base, industry: "헬스케어" }
  const company = { ...base, id: "2", title: "[인바디] 이전 리포트", semester: "2025-2" }
  const industry = { ...base, id: "3", title: "[다른 기업] 리포트", industry: "헬스케어" }
  const semester = { ...base, id: "4", title: "[다른 업종] 리포트" }
  assert.deepEqual(relatedResearch(item, [item, industry, company, semester])?.items, [company])
  assert.deepEqual(relatedResearch(item, [item, industry, semester])?.items, [industry])
  assert.deepEqual(relatedResearch(item, [item, semester])?.items, [semester])
  assert.equal(relatedResearch(item, [item]), null)
})
