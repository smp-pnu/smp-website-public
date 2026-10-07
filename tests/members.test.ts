import assert from "node:assert/strict"
import test from "node:test"
import { memberGenerations, memberSearchEntries, sortMembers, toMember } from "../lib/member-model"
import { loadMembers } from "../lib/member-catalog"
import type { NotionPage } from "../lib/content-model"

const source = "44444444444444448444444444444444"
const rich = (value: string) => [{ plain_text: value }]
function page(index = 1): NotionPage {
  return { id: `a${index.toString(16).padStart(31, "0")}`, object: "page", created_time: "2026-01-01",
    parent: { type: "data_source_id", data_source_id: source },
    properties: {
      "이름": { type: "title", title: rich(`검증 회원 ${index}`) }, "기수": { type: "number", number: 41 },
      "구분": { type: "select", select: { name: "MEMBERS" } }, "공개": { type: "checkbox", checkbox: true },
      "학과": { type: "rich_text", rich_text: rich("경제학과") }, "학번": { type: "rich_text", rich_text: rich("26학번") },
      "표시 순서": { type: "number", number: index * 10 },
      "사진 링크": { type: "url", url: "https://example.com/profile.jpg" },
      "비공개 메모": { type: "rich_text", rich_text: rich("Never expose this field") },
    } }
}

test("members require explicit publication, valid identity and their own source", () => {
  const valid = page()
  assert.equal(toMember(valid, source)?.name, "검증 회원 1")
  for (const modify of [
    (p: NotionPage) => { p.properties["공개"].checkbox = false },
    (p: NotionPage) => { delete p.properties["공개"] },
    (p: NotionPage) => { p.archived = true },
    (p: NotionPage) => { p.in_trash = true },
    (p: NotionPage) => { p.parent!.data_source_id = "55555555555545558555555555555555" },
    (p: NotionPage) => { p.properties["기수"].number = 0 },
    (p: NotionPage) => { p.properties["기수"].number = 41.5 },
    (p: NotionPage) => { p.properties["구분"].select = { name: "비공개" } },
    (p: NotionPage) => { p.properties["이름"].title = [] },
  ]) { const invalid = structuredClone(valid); modify(invalid); assert.equal(toMember(invalid, source), null) }
  assert.equal(toMember(valid, "invalid"), null)
})

test("only public profile fields are serialized; uploaded photos override links and unsafe schemes are rejected", () => {
  const p = page()
  assert.ok(!JSON.stringify(toMember(p, source)).includes("Never expose"))
  p.properties["사진"] = { type: "files", files: [{ type: "file", file: { url: "https://example.com/uploaded.jpg" } }] }
  assert.equal(toMember(p, source)?.image, "https://example.com/uploaded.jpg")
  p.properties["사진"].files = []
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "https://user:password@example.com/a.jpg"]) {
    p.properties["사진 링크"].url = url
    assert.equal(toMember(p, source)?.image, undefined)
  }
})

test("new generations and alumni transfers determine selectors and search destinations without a hard-coded cutoff", () => {
  const older = toMember(page(1), source)!, newer = { ...toMember(page(2), source)!, generation: 55 }
  assert.deepEqual(memberGenerations([older, newer, older]), [55, 41])
  assert.equal(memberSearchEntries([newer])[0].href, "/members?generation=55#generation-panel")
  assert.equal(memberSearchEntries([{ ...newer, group: "alumni" }])[0].href, "/alumni?generation=55#generation-panel")
  const unordered = { ...newer, id: "z", order: undefined }
  assert.deepEqual(sortMembers([older, unordered, newer]).map(p => p.id), [newer.id, "z", older.id])
})

test("the category supports membership plus officer roles without losing existing members", () => {
  const p = page()
  const legacy = toMember(p, source)!
  p.properties["구분"] = { type: "multi_select", multi_select: [{ name: "MEMBERS" }] }
  assert.deepEqual(toMember(p, source), legacy)
  p.properties["구분"].multi_select = ["기장", "MEMBERS", "회장", "회장", "내부 메모"].map(name => ({ name }))
  const officer = toMember(p, source)!
  assert.deepEqual(officer.roles, ["회장", "기장"])
  assert.equal(officer.group, "members")
  assert.ok(memberSearchEntries([officer])[0].text.includes("회장 · 기장"))
  assert.ok(!JSON.stringify(officer).includes("내부 메모"))
  p.properties["구분"].multi_select = ["ALUMNI", "부회장"].map(name => ({ name }))
  assert.equal(toMember(p, source)?.group, "alumni")
  assert.deepEqual(toMember(p, source)?.roles, ["부회장"])
  for (const names of [["회장"], ["MEMBERS", "ALUMNI", "기장"], []]) {
    p.properties["구분"].multi_select = names.map(name => ({ name }))
    assert.equal(toMember(p, source), null)
  }
})

test("628 members paginate once for 100 overlapping reads; later reads reflect withdrawal, and failures expose no stale roster", async () => {
  const originalFetch = globalThis.fetch, originalToken = process.env.NOTION_TOKEN, originalSource = process.env.NOTION_MEMBERS_DATA_SOURCE_ID
  process.env.NOTION_TOKEN = "member-test-only"
  process.env.NOTION_MEMBERS_DATA_SOURCE_ID = source
  let requests = 0, hideFirst = false, fail = false, repeatCursor = false
  globalThis.fetch = async (input, init) => {
    requests++
    assert.match(String(input), new RegExp(`data_sources/${source}/query$`))
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.filter, { property: "공개", checkbox: { equals: true } })
    if (fail) return new Response(null, { status: 403 })
    await new Promise(resolve => setTimeout(resolve, 1))
    const start = Number(body.start_cursor ?? 0), end = Math.min(start + 100, 628)
    const results = Array.from({ length: end - start }, (_, offset) => page(start + offset + 1))
    if (hideFirst && start === 0) results[0].properties["공개"].checkbox = false
    return Response.json({ results, has_more: end < 628, next_cursor: end < 628 ? String(repeatCursor ? 100 : end) : null })
  }
  try {
    const results = await Promise.all(Array.from({ length: 100 }, () => loadMembers()))
    assert.equal(requests, 7)
    assert.ok(results.every(result => result.state === "ready" && result.items.length === 628))
    hideFirst = true
    assert.equal((await loadMembers()).items.length, 627)
    fail = true
    assert.deepEqual(await loadMembers(), { items: [], state: "error" })
    fail = false; repeatCursor = true
    assert.deepEqual(await loadMembers(), { items: [], state: "error" })
    process.env.NOTION_MEMBERS_DATA_SOURCE_ID = ""
    const before = requests
    assert.deepEqual(await loadMembers(), { items: [], state: "unconfigured" })
    assert.equal(requests, before)
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = originalToken
    if (originalSource === undefined) delete process.env.NOTION_MEMBERS_DATA_SOURCE_ID; else process.env.NOTION_MEMBERS_DATA_SOURCE_ID = originalSource
  }
})
