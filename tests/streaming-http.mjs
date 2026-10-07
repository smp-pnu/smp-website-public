// Use only with a local production server preloaded with scale-fixture.mjs.
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { createHmac } from "node:crypto"

const base = "http://127.0.0.1:3004"
const stateFile = process.env.SMP_TEST_STATE
if (!stateFile) throw new Error("Set SMP_TEST_STATE to the local fixture state file")
const id = "a0000000000000000000000000000002"

async function stream(path, markers) {
  const start = performance.now()
  const response = await fetch(base + path)
  const decoder = new TextDecoder()
  const times = {}
  let html = ""
  for await (const chunk of response.body) {
    html += decoder.decode(chunk, { stream: true })
    for (const [key, marker] of Object.entries(markers)) {
      if (html.includes(marker)) times[key] ??= Math.round(performance.now() - start)
    }
  }
  return { status: response.status, times, completeMs: Math.round(performance.now() - start), html }
}

try {
  await writeFile(stateFile, JSON.stringify({ listDelayMs: 200 }))
  const event = JSON.stringify({ type: "page.properties_updated", entity: { type: "page", id } })
  const signature = `sha256=${createHmac("sha256", "local-scale-webhook-test-only").update(event).digest("hex")}`
  assert.equal((await fetch(base + "/api/notion/webhook", {
    method: "POST", headers: { "x-notion-signature": signature }, body: event,
  })).status, 200)
  const home = await stream("/", { heading: "<h1", report: "[검증용] 리포트" })
  assert.equal(home.status, 200)
  assert.ok(home.times.heading < home.times.report - 800, "the home page must not wait for the latest reports")
  console.log(JSON.stringify({ scenario: "slow home catalogue", ...home, html: undefined }))

  await writeFile(stateFile, JSON.stringify({ blockDelayMs: 2000, revision: `slow-${Date.now()}` }))
  const slow = await stream(`/research/${id}`, { heading: "<h1", download: "PDF 다운로드", body: "로컬 부하 검증 본문입니다." })
  assert.equal(slow.status, 200)
  assert.ok(slow.times.heading < slow.times.body - 1500, "the heading must not wait for the Notion body")
  assert.ok(slow.times.download < slow.times.body - 1500, "PDF access must not wait for the Notion body")
  console.log(JSON.stringify({ scenario: "2s body delay", ...slow, html: undefined }))

  await writeFile(stateFile, JSON.stringify({ blockUnavailable: true, revision: `failed-${Date.now()}` }))
  const failed = await stream(`/research/${id}`, { download: "PDF 다운로드", error: "본문을 불러오지 못했습니다." })
  assert.equal(failed.status, 200)
  assert.ok(failed.times.download !== undefined && failed.times.error !== undefined)
  const pdf = await fetch(`${base}/api/content/research/${id}/pdf?source=external`)
  assert.equal(pdf.status, 200)
  assert.ok((await pdf.text()).startsWith("%PDF-"))
  console.log(JSON.stringify({ scenario: "body failure", attachmentsAvailable: true }))

  await writeFile(stateFile, JSON.stringify({ revoked: id }))
  for (const path of [`/research/${id}`, `/api/content/research/${id}/pdf?source=external`]) {
    assert.equal((await fetch(base + path)).status, 404, "streaming must not bypass fresh publication checks")
  }
  console.log(JSON.stringify({ scenario: "revoked publication", detailAndPdfStatus: 404 }))
} finally { await writeFile(stateFile, "{}") }
