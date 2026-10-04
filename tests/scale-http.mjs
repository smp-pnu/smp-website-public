// Run against `next start` with scale-fixture.mjs, never against production.
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHmac } from "node:crypto"
const base = "http://127.0.0.1:3004"
const statsFile = process.env.SMP_TEST_STATS, stateFile = process.env.SMP_TEST_STATE
if (!statsFile || !stateFile) throw new Error("Set SMP_TEST_STATS and SMP_TEST_STATE to the local fixture files")
const id = "a0000000000000000000000000000001"
async function stats() {
  const counts = {}
  for (const row of (await readFile(statsFile, "utf8")).trim().split("\n").filter(Boolean)) {
    const key = JSON.parse(row).path.split("/")[2]
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
async function burst(label, path, expectedText) {
  await writeFile(statsFile, "")
  const durations = [], statuses = []
  await Promise.all(Array.from({ length: 100 }, async () => {
    const start = performance.now(), response = await fetch(base + path)
    const body = await response.text()
    statuses.push(response.status)
    durations.push(performance.now() - start)
    assert.equal(response.status, 200)
    if (expectedText) assert.ok(body.includes(expectedText))
  }))
  durations.sort((a, b) => a - b)
  const upstream = await stats()
  console.log(JSON.stringify({ label, requests: 100, statuses: [...new Set(statuses)], p95ms: Math.round(durations[94]), notion: upstream }))
  return upstream
}
await writeFile(stateFile, "{}")
const cold = await burst("600 reports, cold", "/research", "600")
assert.ok((cold.data_sources ?? 0) <= 6)
const warm = await burst("600 reports, warm", "/research", "600")
assert.equal(warm.data_sources ?? 0, 0)
const notices = await burst("300 notices", "/notice", "300")
assert.ok((notices.data_sources ?? 0) <= 3)
const detail = await burst("same report detail", `/research/${id}`, "로컬 부하 검증 본문")
assert.ok((detail.pages ?? 0) <= 3)
assert.ok((detail.blocks ?? 0) <= 1)
const pdf = await burst("same small fixture PDF", `/api/content/research/${id}/pdf?source=external`, "%PDF-")
assert.ok((pdf.pages ?? 0) <= 3)

await writeFile(stateFile, JSON.stringify({ revoked: id }))
for (const path of [`/research/${id}`, `/api/content/research/${id}/pdf?source=external`]) {
  assert.equal((await fetch(base + path)).status, 404)
}
const event = JSON.stringify({ type: "page.properties_updated", entity: { type: "page", id } })
const signature = `sha256=${createHmac("sha256", "local-scale-webhook-test-only").update(event).digest("hex")}`
assert.equal((await fetch(base + "/api/notion/webhook", { method: "POST", headers: { "x-notion-signature": signature }, body: event })).status, 200)
const refreshed = await (await fetch(base + "/research")).text()
assert.ok(!refreshed.includes(`href="/research/${id}"`), "webhook must invalidate a warmed catalogue")
console.log(JSON.stringify({ publicationRevocation: "detail and PDF return 404 immediately; webhook removes cached list entry" }))
await writeFile(stateFile, "{}")
