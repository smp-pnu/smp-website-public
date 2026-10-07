// Local-only end-to-end fixture; no production credentials or mutations.
import "./scale-fixture.mjs"
import { appendFileSync, readFileSync } from "node:fs"
process.env.NOTION_MEMBERS_DATA_SOURCE_ID = "44444444444444448444444444444444"
const previousFetch = globalThis.fetch
const rich = value => [{ plain_text: value }]
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.origin !== "https://api.notion.com" || !url.pathname.includes(process.env.NOTION_MEMBERS_DATA_SOURCE_ID)) return previousFetch(input, init)
  let state = {}
  try { state = JSON.parse(readFileSync(process.env.SMP_TEST_STATE, "utf8")) } catch {}
  if (process.env.SMP_TEST_STATS) appendFileSync(process.env.SMP_TEST_STATS, `${JSON.stringify({ path: url.pathname, at: Date.now() })}\n`)
  if (state.memberUnavailable) return new Response(null, { status: 403 })
  const start = Number(JSON.parse(String(init?.body)).start_cursor ?? 0), end = Math.min(start + 100, 628)
  const results = Array.from({ length: end - start }, (_, offset) => {
    const index = start + offset + 1
    return { id: `c${index.toString(16).padStart(31, "0")}`, object: "page", created_time: "2026-01-01",
      parent: { type: "data_source_id", data_source_id: process.env.NOTION_MEMBERS_DATA_SOURCE_ID },
      properties: {
        "이름": { title: rich(`[검증회원] ${index}`) }, "기수": { number: index > 626 ? 41 : index > 620 ? 40 : 35 },
        "구분": { multi_select: [index > 620 ? "MEMBERS" : "ALUMNI", ...(index === 628 ? ["회장", "기장"] : index === 627 ? ["부회장"] : [])].map(name => ({ name })) },
        "학과": { rich_text: rich("경제학과") }, "학번": { rich_text: rich("26학번") },
        "공개": { checkbox: !(state.memberHidden && index === 628) }, "표시 순서": { number: index },
        "비공개 메모": { rich_text: rich("private-member-note-must-not-appear") },
      } }
  })
  return Response.json({ results, has_more: end < 628, next_cursor: end < 628 ? String(end) : null })
}
