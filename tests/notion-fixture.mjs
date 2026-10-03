// Explicit local test harness; never imported by application code.
import { readFile } from "node:fs/promises"
if (process.env.SMP_TEST_FIXTURES !== "1") throw new Error("Set SMP_TEST_FIXTURES=1 to use test data")
process.env.NOTION_TOKEN = "local-test-fixture-token"
process.env.NOTION_NOTICES_DATA_SOURCE_ID = "22222222222242228222222222222222"
process.env.NOTION_REPORTS_DATA_SOURCE_ID = "33333333333343338333333333333333"
const nativeFetch = globalThis.fetch
const previewDriveId = process.env.SMP_TEST_DRIVE_ID ?? "public-drive-fixture"
const text = value => [{ plain_text: value, text: { content: value } }]
function page(index, research, published = true) {
  return {
    object: "page", id: `${research ? "a" : "b"}1111111111141118111${String(index).padStart(12, "0")}`,
    created_time: "2026-01-01T00:00:00Z",
    properties: {
      "제목": { type: "title", title: text(published ? `[검증용] ${research ? "산업 분석 리포트" : "정규 세션 안내"} ${index}` : "비공개 검증 글") },
      "공개": { type: "checkbox", checkbox: published },
      "게시일": { type: "date", date: { start: "2026-01-01" } },
      "분류": { type: "select", select: { name: research ? (index % 2 ? "산업분석" : "기업분석") : "공지" } },
      "요약": { type: "rich_text", rich_text: text("화면 검증을 위한 임시 데이터입니다. 실제 게시물이 아닙니다.") },
      "작성자": { type: "rich_text", rich_text: text("SMP 검증팀") },
      "상단 고정": { type: "checkbox", checkbox: index === 2 },
      "첨부파일": { type: "files", files: [{ name: "sample-report.pdf", type: "external", external: { url: "https://example.com/sample-report.pdf" } }] },
      ...(research && index % 4 === 3 && process.env.SMP_TEST_PDF ? { "첨부파일": { type: "files", files: [{ name: "sample-report.pdf", type: "file", file: { url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/smp-fixture.pdf" } }] } } : {}),
      ...(research && index % 4 !== 2 ? { "외부 링크": { type: "url", url: `https://drive.google.com/file/d/${index % 4 === 0 ? "missing-fixture-report" : previewDriveId}/view` } } : {}),
    },
  }
}
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.hostname === "prod-files-secure.s3.us-west-2.amazonaws.com" && url.pathname === "/smp-fixture.pdf" && process.env.SMP_TEST_PDF) return new Response(await readFile(process.env.SMP_TEST_PDF), { headers: { "content-type": "application/pdf" } })
  if (url.hostname === "drive.google.com" && url.searchParams.get("id") === "missing-fixture-report") return new Response(null, { status: 404 })
  if (url.origin !== "https://api.notion.com") return nativeFetch(input, init)
  if (url.pathname.includes("data_sources")) {
    const research = url.pathname.includes(process.env.NOTION_REPORTS_DATA_SOURCE_ID)
    return Response.json({ results: [...Array.from({ length: research ? 16 : 2 }, (_, index) => page(index + 1, research)), page(99, research, false)], has_more: false, next_cursor: null })
  }
  return Response.json({ results: [
    { id: "heading", type: "heading_2", heading_2: { rich_text: text("검증용 본문") } },
    { id: "paragraph", type: "paragraph", paragraph: { rich_text: text("노션에서 작성한 본문이 웹사이트에 표시되는 흐름을 확인합니다.") } },
    { id: "list1", type: "numbered_list_item", numbered_list_item: { rich_text: text("첫 번째 항목") } },
    { id: "list2", type: "numbered_list_item", numbered_list_item: { rich_text: text("두 번째 항목") } },
  ], has_more: false, next_cursor: null })
}
