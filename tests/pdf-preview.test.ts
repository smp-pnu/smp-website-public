import { test } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { renderFirstPage } from "../lib/pdf-preview-render"

function samplePdf() {
  const paint = "1 0 0 rg 0 0 595 842 re f 0 0 1 rg 0 0 100 100 re f"
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${paint.length} >>\nstream\n${paint}\nendstream`]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

test("server renderer produces sharp first-page pixels from PDF vectors at reader resolution", async () => {
  const image = await renderFirstPage(samplePdf())
  const metadata = await sharp(image).metadata()
  assert.equal(metadata.width, 2048)
  assert.ok(metadata.height! > 2800)
  const pixel = async (top: number) => [...await sharp(image).extract({ left: 10, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()]
  assert.deepEqual(await pixel(10), [255, 0, 0])
  assert.deepEqual(await pixel(metadata.height! - 10), [0, 0, 255])
})

test("aborted preview work stops before initializing a PDF document", async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(renderFirstPage(samplePdf(), controller.signal), { name: "AbortError" })
})
