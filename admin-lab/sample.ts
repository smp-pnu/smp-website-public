// Synthetic ASCII PDFs exercise the real PDF.js path without reading live CMS data.
export function samplePdf(index: number): File {
  const rated = index === 0
  const lines = rated ? [
    "SMP / RESEARCH LAB", "HPSP (403870)", "Precision creates growth", "Report date: 2026-10-20",
    "Target year: 2027", "Target price: 50,000 KRW", "Upside: 25.0%", "Team: R1", "SYNTHETIC SAMPLE - NOT INVESTMENT RESEARCH",
  ] : ["SMP / RESEARCH LAB", "InBody (041830)", "A new chapter for measurement", "Report date: 2026-10-21", "Not Rated", "Team: R2", "SYNTHETIC SAMPLE - NOT INVESTMENT RESEARCH"]
  const pages = [lines, ["02 / BUSINESS", "This page tests a multi-page PDF.", "All figures in this document are fictional."], ["03 / REVIEW", "Review the source before approving.", "Approval in this lab never publishes a website."]]
  const escape = (s: string) => s.replace(/[\\()]/g, "\\$&")
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
  for (const [i, text] of pages.entries()) {
    const stream = `0.06 0.11 0.16 rg 0 0 595 842 re f\n0.65 0.85 0.95 rg 44 766 507 3 re f\nBT /F1 22 Tf 44 720 Td 34 TL 1 1 1 rg\n${text.map(line => `(${escape(line)}) Tj T*`).join("\n")}\nET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  let pdf = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const filename = rated ? "[2026-2] HPSP - Precision creates growth.pdf" : "[2026-2] InBody - A new chapter.pdf"
  return new File([pdf], filename, { type: "application/pdf" })
}
