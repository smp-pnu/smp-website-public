import assert from "node:assert/strict"
import { test } from "node:test"
import { defaultQuery, filterReports, moveReport } from "../admin-lab/library-model"
import { emptyFields, type Draft } from "../admin-lab/model"
import { safeNoticeLink } from "../admin-lab/notice-model"
const draft = (id: string, semester: string, author: string, company: string): Draft => ({
  id,
  hash: "a".repeat(64),
  filename: `${company}.pdf`,
  fileBytes: 100,
  storedBytes: 150,
  pages: 3,
  fields: {
    ...emptyFields(),
    title: company,
    company,
    ticker: "064670",
    semester,
    author,
    date: "2026-10-26",
    industry: "반도체",
  },
  evidence: [],
  warnings: [],
  revision: 1,
  approvedRevision: null,
  approvedAt: null,
  createdAt: "2026-10-26",
  updatedAt: "2026-10-26",
  trashedAt: null,
})
test("report folder/filter/search preserve manual order and handle Korean filenames", () => {
  const rows = [
    draft("a", "2026-2", "리서치 1팀", "티씨케이"),
    draft("b", "2026-1", "신입 1팀", "인바디"),
    draft("c", "2026-2", "리서치 2팀", "삼성전자"),
  ]
  assert.deepEqual(
    filterReports(rows, defaultQuery, ["c", "b", "a"]).map((d) => d.id),
    ["c", "b", "a"],
  )
  assert.deepEqual(
    filterReports(rows, { ...defaultQuery, semester: "2026-2" }, ["c", "b", "a"]).map((d) => d.id),
    ["c", "a"],
  )
  assert.deepEqual(
    filterReports(rows, { ...defaultQuery, query: "티씨케이 064670", author: "리서치 1팀" }, []).map(
      (d) => d.id,
    ),
    ["a"],
  )
  assert.deepEqual(
    filterReports(rows, { ...defaultQuery, query: "티씨케이.pdf" }, []).map((d) => d.id),
    ["a"],
  )
  assert.deepEqual(moveReport(["c", "b", "a"], "a", "c"), ["a", "c", "b"])
  assert.deepEqual(moveReport(["c", "b", "a"], "missing", "c"), ["c", "b", "a"])
  assert.deepEqual(
    filterReports([{ ...rows[0], trashedAt: "2026-10-26" }, rows[1]], defaultQuery, []).map((d) => d.id),
    ["b"],
  )
  assert.deepEqual(
    filterReports(
      [{ ...rows[0], approvedRevision: 1 }, rows[1]],
      { ...defaultQuery, filter: "approved" },
      [],
    ).map((d) => d.id),
    ["a"],
  )
})
test("notice preview only links https and mailto; executable/untrusted URLs stay plain text", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://x.test",
    "https://user:pass@x.test",
    "//x.test",
    "/admin",
  ])
    assert.equal(safeNoticeLink(value), undefined)
  assert.equal(safeNoticeLink("https://pnusmp.com"), "https://pnusmp.com/")
  assert.equal(safeNoticeLink("mailto:hello@example.com"), "mailto:hello@example.com")
})
