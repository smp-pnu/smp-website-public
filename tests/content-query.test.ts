import { test } from "node:test"
import assert from "node:assert/strict"
import type { ContentItem } from "../lib/content-model"
import { createContentSearchIndex, findContentMatches, selectContentPage } from "../lib/content-query"

const items: ContentItem[] = Array.from({ length: 31 }, (_, index) => ({
  id: String(index).padStart(32, "0"), kind: "research", title: `[2026-2] 기업 ${index + 1}`,
  summary: "Target Price 100,000 · 성장", date: "2026-01-01", author: index % 2 ? "R2" : "R1",
  category: index % 2 ? "산업분석" : "기업분석", pinned: false, attachments: [], externalUrl: null,
}))

test("list and autocomplete share case-insensitive, multi-field AND matching within the selected category", () => {
  const query = "  PRICE   성장 R1 "
  const page = selectContentPage(items, "research", { q: query, category: "기업분석" })
  const suggestions = findContentMatches(createContentSearchIndex(items), query, "기업분석", 6)
  assert.equal(page.total, 16)
  assert.deepEqual(suggestions, page.visibleItems.slice(0, 6))
  assert.equal(findContentMatches(createContentSearchIndex(items), query, "산업분석").length, 0)
  assert.equal(findContentMatches(createContentSearchIndex(items), "unknown").length, 0)
})

test("page selection preserves catalogue order, titles and filter context without changing the input", () => {
  const before = structuredClone(items)
  const result = selectContentPage(items, "research", { page: "2" })
  assert.deepEqual(result.visibleItems, items.slice(12, 24))
  assert.deepEqual(result.listSearch, { q: "", category: "", page: "2" })
  assert.equal(result.totalPages, 3)
  assert.deepEqual(items, before)
  assert.equal(selectContentPage(items, "notice", { page: "2" }).visibleItems[0].id, items[10].id)
})

test("out-of-range, malformed and empty pages always resolve to a valid list and return context", () => {
  const final = selectContentPage(items, "research", { page: "999", category: "산업분석" })
  assert.equal(final.page, 2)
  assert.equal(final.visibleItems.length, 3)
  assert.equal(final.listSearch.page, "2")
  assert.deepEqual(final.categories, ["기업분석", "산업분석"])
  for (const page of ["-1", "1.5", "NaN", ["2", "3"]]) {
    assert.equal(selectContentPage(items, "research", { page }).page, 1)
  }
  const empty = selectContentPage(items, "research", { q: "없는 결과", page: "8" })
  assert.equal(empty.page, 1)
  assert.equal(empty.totalPages, 1)
  assert.deepEqual(empty.visibleItems, [])
})

test("autocomplete stops after six matches instead of scanning the remaining catalogue", () => {
  const index = createContentSearchIndex(items.slice(0, 6))
  index.push({ item: items[6], get text(): string { throw new Error("Unnecessary scan") } })
  assert.equal(findContentMatches(index, "기업", "", 6).length, 6)
  assert.equal(findContentMatches(index, "기업", "", 0).length, 0)
})
