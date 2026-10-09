// Build-time opt-in only. Contains no credentials or real member/report data.
export const fixture = { revoked: "", counts: {} as Record<string, number> }
const reports = "33333333333343338333333333333333"
const notices = "22222222222242228222222222222222"
process.env.NOTION_TOKEN = "local-cloudflare-fixture"
process.env.NOTION_REPORTS_DATA_SOURCE_ID = reports
process.env.NOTION_NOTICES_DATA_SOURCE_ID = notices
process.env.NOTION_MEMBERS_DATA_SOURCE_ID = "44444444444444448444444444444444"
process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = "local-scale-webhook-test-only"
process.env.BLOB_READ_WRITE_TOKEN = ""
process.env.BLOB_STORE_ID = ""
process.env.NOTION_METADATA_WRITE_ENABLED = "false"
const originalFetch = globalThis.fetch
const text = (value: string) => [{ plain_text: value, text: { content: value } }]
function page(index: number, kind: "research" | "notice") {
  const id = `${kind === "research" ? "a" : "b"}${index.toString(16).padStart(31, "0")}`
  return { object: "page", id, last_edited_time: "2026-01-01T00:00:00Z", created_time: "2026-01-01T00:00:00Z",
    parent: { type: "data_source_id", data_source_id: kind === "research" ? reports : notices },
    properties: {
      제목: { title: text(`[검증용] ${kind === "research" ? "리포트" : "공지"} ${index}`) },
      공개: { checkbox: fixture.revoked !== id }, 게시일: { date: { start: "2026-01-01" } },
      분류: { select: { name: index % 2 ? "기업분석" : "산업분석", color: "blue" } },
      요약: { rich_text: text("600개 리포트와 300개 공지의 이전 검증 자료입니다.") },
      작성자: { rich_text: text("SMP 테스트") },
      "외부 링크": { url: `https://drive.google.com/file/d/fixture-report-${index}/view` },
    } }
}
const pdfText = "BT /F1 24 Tf 50 700 Td (SMP migration test PDF) Tj ET"
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`]
let pdf = "%PDF-1.4\n"
const offsets: number[] = []
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
const xref = pdf.length
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

export const upstreamFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.hostname === "drive.usercontent.google.com") {
    const headers = new Headers(init?.headers)
    const range = /^bytes=(\d+)-(\d*)$/.exec(headers.get("range") ?? "")
    if (range) {
      const start = Number(range[1]), end = Math.min(Number(range[2] || pdf.length - 1), pdf.length - 1)
      if (start >= pdf.length) return new Response(null, { status: 416, headers: { "content-range": `bytes */${pdf.length}` } })
      return new Response(pdf.slice(start, end + 1), { status: 206, headers: { "content-type": "application/pdf", "content-range": `bytes ${start}-${end}/${pdf.length}`, "accept-ranges": "bytes", "content-length": String(end - start + 1) } })
    }
    return new Response(pdf, { headers: { "content-type": "application/pdf", "accept-ranges": "bytes", "content-length": String(pdf.length) } })
  }
  if (url.hostname === "drive.google.com" && url.pathname === "/thumbnail") return new Response(null, { status: 404 })
  if (url.origin !== "https://api.notion.com") return originalFetch(input, init)
  const group = url.pathname.split("/")[2]
  fixture.counts[group] = (fixture.counts[group] ?? 0) + 1
  await new Promise(resolve => setTimeout(resolve, 20))
  if (group === "data_sources") {
    const kind = url.pathname.includes(reports) ? "research" : "notice"
    if (!url.pathname.includes(reports) && !url.pathname.includes(notices)) return Response.json({ results: [], has_more: false })
    const start = Number(JSON.parse(String(init?.body)).start_cursor ?? 0)
    const total = kind === "research" ? 600 : 300, end = Math.min(start + 100, total)
    return Response.json({ results: Array.from({ length: end - start }, (_, offset) => page(start + offset + 1, kind)).filter(p => p.properties.공개.checkbox),
      has_more: end < total, next_cursor: end < total ? String(end) : null })
  }
  if (group === "pages") {
    const id = url.pathname.split("/").pop()!, kind = id[0] === "a" ? "research" : "notice"
    const index = parseInt(id.slice(1), 16)
    return index > 0 && index <= (kind === "research" ? 600 : 300) ? Response.json(page(index, kind)) : new Response(null, { status: 404 })
  }
  return Response.json({ results: [{ id: "test-body", type: "paragraph", paragraph: { rich_text: text("로컬 부하 검증 본문입니다.") } }], has_more: false, next_cursor: null })
}
