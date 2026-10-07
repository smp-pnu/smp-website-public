// Extends the local-only scale fixture to exercise research discovery and metadata.
import "./scale-fixture.mjs"
const fixtureFetch = globalThis.fetch
const rich = value => ({ rich_text: [{ plain_text: value, text: { content: value } }] })
const stream = "BT /F1 24 Tf 50 700 Td (SMP reader test) Tj ET"
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"]
let pdf = "%PDF-1.4\n"
const offsets = []
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
const xref = pdf.length
pdf += `xref\n0 7\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
function metadata(page) {
  if (!page.id?.startsWith("a")) return page
  const index = parseInt(page.id.slice(1), 16)
  Object.assign(page.properties, {
    "학기": rich(index <= 36 ? "2026-2" : "2025-2"),
    "업종": { select: { name: index % 3 ? "헬스케어" : "소비재" } },
    "기업명": rich(index % 3 ? "인바디" : "한국콜마"),
    "종목코드": rich(index % 3 ? "041830" : "161890"),
    "투자 포인트": rich("의료기기 수요 확대\n해외 매출 비중 확대"),
    "요약": rich(index % 5 ? "타겟년도: 2027년 · Target price: 79,500원 · 상승여력: 48.1%" : "Not Rated"),
  })
  return page
}
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.hostname === "drive.usercontent.google.com") return new Response(pdf, { headers: { "content-type": "application/pdf" } })
  const response = await fixtureFetch(input, init)
  if (url.hostname !== "api.notion.com" || !response.ok || (!url.pathname.includes("data_sources") && !url.pathname.includes("/pages/"))) return response
  const data = await response.json()
  return Response.json(data.results ? { ...data, results: data.results.map(metadata) } : metadata(data))
}
