import assert from "node:assert/strict"
import { test } from "node:test"
import { defaultQuery, filterReports, moveListItem } from "../admin-lab/library-model"
import { emptyFields, type Draft } from "../admin-lab/model"
import { safeNoticeLink, orderNotices, type NoticeSummary } from "../admin-lab/notice-model"
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
  assert.deepEqual(moveListItem(["c", "b", "a"], "a", "c"), ["a", "c", "b"])
  assert.deepEqual(moveListItem(["c", "b", "a"], "missing", "c"), ["c", "b", "a"])
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
test("drop edges insert before or after the target in either direction", () => {
  const ids = ["a", "b", "c", "d"]
  assert.deepEqual(moveListItem(ids, "a", "c", "before"), ["b", "a", "c", "d"])
  assert.deepEqual(moveListItem(ids, "a", "c", "after"), ["b", "c", "a", "d"])
  assert.deepEqual(moveListItem(ids, "d", "b", "before"), ["a", "d", "b", "c"])
  assert.deepEqual(moveListItem(ids, "d", "b", "after"), ["a", "b", "d", "c"])
  assert.deepEqual(moveListItem(ids, "d", "a", "before"), ["d", "a", "b", "c"])
  assert.deepEqual(moveListItem(ids, "a", "d", "after"), ["b", "c", "d", "a"])
  assert.deepEqual(ids, ["a", "b", "c", "d"], "source order is immutable")
})
test("unchanged or invalid drops retain the order reference so they do not write", () => {
  const ids = ["a", "b", "c"]
  for (const edge of ["before", "after"] as const) {
    assert.equal(moveListItem(ids, "b", "b", edge), ids)
    assert.equal(moveListItem(ids, "missing", "b", edge), ids)
    assert.equal(moveListItem(ids, "a", "missing", edge), ids)
  }
  assert.equal(moveListItem(ids, "a", "b", "before"), ids)
  assert.equal(moveListItem(ids, "b", "a", "after"), ids)
})
test("filtered drops preserve hidden reports; arrows still cross page boundaries", () => {
  const ids = ["a", "hidden-1", "b", "hidden-2", "c"]
  assert.deepEqual(moveListItem(ids, "c", "a", "before"), ["c", "a", "hidden-1", "b", "hidden-2"])
  assert.deepEqual(moveListItem(ids, "a", "b", "after"), ["hidden-1", "b", "a", "hidden-2", "c"])
  const pages = Array.from({ length: 25 }, (_, index) => String(index))
  const down = moveListItem(pages, "19", "20")
  assert.deepEqual(down.slice(18, 22), ["18", "20", "19", "21"])
  assert.deepEqual(moveListItem(down, "19", "20"), pages)
})
test("notice display honors manual order inside pinned groups and preserves filtered-out items", () => {
  const notice = (id: string, pinned = false): NoticeSummary => ({ id, pinned, title: id, category: "공지", date: "2026-10-27", excerpt: "", revision: 1, approvedRevision: null, createdAt: "2026-10-27", updatedAt: "2026-10-27", trashedAt: null })
  const rows = [notice("a"), notice("b"), notice("pin", true), notice("hidden")]
  const ids = ["pin", "a", "hidden", "b"]
  const moved = moveListItem(ids, "b", "a", "before")
  assert.deepEqual(moved, ["pin", "b", "a", "hidden"])
  assert.deepEqual(orderNotices(rows, moved).map((n) => n.id), moved)
  assert.deepEqual(orderNotices(rows, ["b", "a", "pin", "hidden"]).map((n) => n.id), ["pin", "b", "a", "hidden"])
})
