import { test } from "node:test"
import assert from "node:assert/strict"
import { siteSearchMatches, siteSearchDescription } from "../lib/site-search-query"
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

test("compact previews keep summary and author searchable without rendering the index blob", () => {
  const [match] = siteSearchMatches(entries, "목표주가 홍길동");
  assert.equal(siteSearchDescription(match), "반도체");
  assert.equal(match.text, entries[0].text);
  assert.equal(siteSearchDescription({...entries[0], text:"R1 · 장문 요약"}), "리서치 1팀");
  assert.equal(siteSearchDescription({...entries[0], text:""}), "리포트");
  assert.equal(siteSearchDescription({title:"학회 소개",label:"페이지",text:"SMP의 활동",href:"/about"}), "SMP의 활동");
});
