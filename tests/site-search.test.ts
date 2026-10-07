import { test } from "node:test"
import assert from "node:assert/strict"
import { siteSearchMatches } from "../lib/site-search-query"
const entries = [
  { title: "[2026-2] 삼성전자 R1", text: "반도체 · 목표주가 100000 · 홍길동", label: "리포트", href: "/research/abc" },
  { title: "2026 모집 공지", text: "학회원 모집", label: "공지", href: "/notice/abc" },
]
test("header previews and full search share Korean, multi-term and case-insensitive matching", () => {
  assert.deepEqual(siteSearchMatches(entries, "삼성 반도체"), [entries[0]])
  assert.deepEqual(siteSearchMatches(entries, "r1 홍길동"), [entries[0]])
  assert.deepEqual(siteSearchMatches(entries, "목표주가"), [entries[0]])
  assert.deepEqual(siteSearchMatches(entries, "삼성 모집"), [])
  assert.deepEqual(siteSearchMatches(entries, "  "), [])
  assert.deepEqual(siteSearchMatches(entries, "2026", 1), [entries[0]])
  assert.deepEqual(siteSearchMatches(entries, "2026", 0), [])
})
