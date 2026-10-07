// Opt-in, local-only fixture. Never imported by the application or CI build.
import { appendFileSync, readFileSync } from "node:fs"
if (process.env.SMP_TEST_FIXTURES !== "1" || process.env.VERCEL) throw new Error("Local test environment required")
process.env.NOTION_TOKEN = `local-scale-fixture-${process.env.SMP_TEST_RUN ?? "1"}`
process.env.NOTION_NOTICES_DATA_SOURCE_ID = "22222222222242228222222222222222"
process.env.NOTION_REPORTS_DATA_SOURCE_ID = "33333333333343338333333333333333"
process.env.BLOB_READ_WRITE_TOKEN = ""
process.env.BLOB_STORE_ID = ""
process.env.VERCEL_OIDC_TOKEN = ""
process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = "local-scale-webhook-test-only"
const nativeFetch = globalThis.fetch
const counts = { research: 600, notice: 300 }
const text = value => [{ plain_text: value, text: { content: value } }]
function state() {
  try { return JSON.parse(readFileSync(process.env.SMP_TEST_STATE, "utf8")) } catch { return {} }
}
function page(index, kind, state) {
  const id = `${kind === "research" ? "a" : "b"}${index.toString(16).padStart(31, "0")}`
  return { object: "page", id, created_time: "2026-01-01T00:00:00Z", last_edited_time: state.revision ?? "2026-01-01T00:00:00Z",
    parent: { type: "data_source_id", data_source_id: kind === "research" ? process.env.NOTION_REPORTS_DATA_SOURCE_ID : process.env.NOTION_NOTICES_DATA_SOURCE_ID },
    properties: { "제목": { title: text(`[검증용] ${kind === "research" ? "리포트" : "공지"} ${index}`) },
      "공개": { checkbox: state.revoked !== id }, "게시일": { date: { start: "2026-01-01" } },
      "분류": { select: { name: index % 2 ? "기업분석" : "산업분석", color: "blue" } },
      "요약": { rich_text: text("600개 리포트와 300개 공지를 사용하는 로컬 부하 검증 자료입니다.") },
      "작성자": { rich_text: text("SMP 테스트") },
      "외부 링크": { url: `https://drive.google.com/file/d/fixture-report-${index}/view` },
    } }
}
const pdfText = "BT /F1 24 Tf 50 700 Td (SMP test PDF) Tj ET"
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`]
let pdf = "%PDF-1.4\n", offsets = [0]
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
const xref = pdf.length
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.hostname === "drive.google.com" && url.pathname === "/thumbnail") return new Response(readFileSync("public/backgrounds/research-desk.webp"))
  if (url.hostname === "drive.usercontent.google.com") return new Response(pdf, { headers: { "content-type": "application/pdf" } })
  if (url.origin !== "https://api.notion.com") return nativeFetch(input, init)
  if (process.env.SMP_TEST_STATS) appendFileSync(process.env.SMP_TEST_STATS, `${JSON.stringify({ path: url.pathname, at: Date.now() })}\n`)
  const current = state()
  if (current.unavailable) return new Response(null, { status: 503, headers: { "retry-after": "60" } })
  await new Promise(resolve => setTimeout(resolve, 20))
  if (url.pathname.includes("data_sources")) {
    if (current.listDelayMs) await new Promise(resolve => setTimeout(resolve, current.listDelayMs))
    const kind = url.pathname.includes(process.env.NOTION_REPORTS_DATA_SOURCE_ID) ? "research" : "notice"
    const start = Number(JSON.parse(String(init?.body)).start_cursor ?? 0)
    const end = Math.min(start + 100, counts[kind])
    return Response.json({ results: Array.from({ length: end - start }, (_, offset) => page(start + offset + 1, kind, current)).filter(p => p.properties["공개"].checkbox),
      has_more: end < counts[kind], next_cursor: end < counts[kind] ? String(end) : null })
  }
  if (url.pathname.includes("/pages/")) {
    const id = url.pathname.split("/").pop(), kind = id[0] === "a" ? "research" : "notice"
    const index = parseInt(id.slice(1), 16)
    if (!(index > 0 && index <= counts[kind])) return new Response(null, { status: 404 })
    return Response.json(page(index, kind, current))
  }
  if (current.blockDelayMs) await new Promise(resolve => setTimeout(resolve, current.blockDelayMs))
  if (current.blockUnavailable) return new Response(null, { status: 400 })
  return Response.json({ results: [{ id: "test-body", type: "paragraph", paragraph: { rich_text: text("로컬 부하 검증 본문입니다.") } }], has_more: false, next_cursor: null })
}
