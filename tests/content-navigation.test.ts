import { test } from "node:test"
import assert from "node:assert/strict"
import type { ContentItem, ContentKind } from "../lib/content-model"
import { contentDetailHref, contentListHref, contentReturnHref, normalizeContentSearch, safeSiteHref } from "../lib/content-navigation"

function item(kind: ContentKind): ContentItem {
  return { kind, id: "11111111111141118111111111111111", title: "리포트", summary: "", date: "2026-01-01", category: "기업분석", author: "R1", pinned: false, attachments: [], externalUrl: null }
}

test("list to article to list preserves the page and encoded Korean filters for both content types", () => {
  for (const kind of ["research", "notice"] as const) {
    const content = item(kind)
    const search = { q: " 기업 A&B + 성장 ", category: "기업/산업 분석", page: "3" }
    const detail = new URL(contentDetailHref(content, search), "https://smp.test")
    const returnSearch = Object.fromEntries(detail.searchParams)
    const back = new URL(contentReturnHref(content, returnSearch), "https://smp.test")
    assert.equal(detail.pathname, `/${kind}/${content.id}`)
    assert.equal(back.pathname, `/${kind}`)
    assert.equal(back.searchParams.get("q"), "기업 A&B + 성장")
    assert.equal(back.searchParams.get("category"), search.category)
    assert.equal(back.searchParams.get("page"), "3")
    assert.equal(back.hash, `#content-${content.id}`)
  }
})

test("unfiltered first-page links retain their card anchor while direct article links fall back to the list root", () => {
  const content = item("research")
  assert.equal(contentDetailHref(content, { page: "1" }), `/research/${content.id}?page=1`)
  assert.equal(contentReturnHref(content, { page: "1" }), `/research?page=1#content-${content.id}`)
  assert.equal(contentDetailHref(content), `/research/${content.id}`)
  assert.equal(contentReturnHref(content), "/research")
})

test("an opening or failed article can return to its filtered list using only the route identity", () => {
  const route = { kind: "research" as const, id: item("research").id }
  const back = new URL(contentReturnHref(route, { page: "3", industry: "금융", view: "list" }), "https://smp.test")
  assert.equal(back.pathname, "/research")
  assert.equal(back.searchParams.get("page"), "3")
  assert.equal(back.searchParams.get("industry"), "금융")
  assert.equal(back.searchParams.get("view"), "list")
  assert.equal(back.hash, `#content-${route.id}`)
})

test("invalid and duplicate query parameters cannot create an invalid return page", () => {
  for (const page of ["0", "-1", "Infinity", "NaN", "1.5", "9007199254740992", ["2", "3"]]) {
    assert.equal(contentListHref("notice", { page }), "/notice")
  }
  assert.deepEqual(normalizeContentSearch({ q: ["a", "b"], category: ["c", "d"] }), { q: "", category: "", page: undefined })
  assert.equal(normalizeContentSearch({ q: "x".repeat(200) }).q.length, 100)
})

test("only list filters are carried through, never an arbitrary redirect or PDF page", () => {
  const search = Object.fromEntries(new URLSearchParams("page=2&from=https://example.com&returnTo=javascript:alert(1)&source=external&download=1"))
  assert.equal(contentDetailHref(item("research"), search), "/research/11111111111141118111111111111111?page=2")
  assert.equal(contentListHref("research", search), "/research?page=2")
})

test("malformed content identifiers cannot add URL segments, queries or HTML", () => {
  const content = { ...item("research"), id: 'a/b?source=external#<img src=x>' }
  const url = new URL(contentDetailHref(content), "https://smp.test")
  assert.equal(url.pathname, "/research/a%2Fb%3Fsource%3Dexternal%23%3Cimg%20src%3Dx%3E")
  assert.equal(url.search, "")
  assert.equal(url.hash, "")
  assert.ok(contentReturnHref(content, { page: "2" }).endsWith("#content-a%2Fb%3Fsource%3Dexternal%23%3Cimg%20src%3Dx%3E"))
})

test("search links reject executable schemes and off-site navigation", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,test", "https://evil.test/", "//evil.test/", "/\\evil.test/", "/\nevil.test/"]) {
    assert.equal(safeSiteHref(href), "/search")
  }
  for (const href of ["/research/abc?page=2", "/members?generation=40", "/search?q=%EB%B6%80%EC%82%B0#results"]) {
    assert.equal(safeSiteHref(href), href)
  }
})
