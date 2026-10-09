// Local workerd integration test. Never uses production credentials or data.
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
const base = "http://127.0.0.1:3004"
const id = "a0000000000000000000000000000001"
async function state(values) {
  await fetch(base + "/__fixture", { method: "POST", body: JSON.stringify(values) })
}
async function burst(label, path, content, maxQueries) {
  await state({ counts: {} })
  const times = []
  await Promise.all(Array.from({ length: 100 }, async () => {
    const start = performance.now(), response = await fetch(base + path)
    const body = await response.text()
    assert.equal(response.status, 200, `${label}: ${body.slice(0, 80)}`)
    assert.ok(body.includes(content), `${label}: expected content missing`)
    times.push(performance.now() - start)
  }))
  const { counts } = await (await fetch(base + "/__fixture")).json()
  times.sort((a, b) => a - b)
  console.log(JSON.stringify({ label, requests: 100, p95ms: Math.round(times[94]), upstream: counts }))
  for (const [key, limit] of Object.entries(maxQueries)) assert.ok((counts[key] ?? 0) <= limit, `${key}: ${counts[key]} > ${limit}`)
}
await state({ revoked: "", counts: {} })
await burst("600 reports", "/research", "600", { data_sources: 6 })
await burst("warm report list", "/research", "600", { data_sources: 0 })
await burst("300 notices", "/notice", "300", { data_sources: 3 })
await burst("report detail", `/research/${id}`, "로컬 부하 검증 본문", { pages: 3, blocks: 1 })
await burst("PDF", `/api/content/research/${id}/pdf?source=external`, "%PDF-", { pages: 3 })
const pdf = await fetch(base + `/api/content/research/${id}/pdf?source=external`, { headers: { Range: "bytes=0-99" } })
assert.equal(pdf.status, 206)
assert.equal((await pdf.arrayBuffer()).byteLength, 100)
assert.match(pdf.headers.get("content-range"), /^bytes 0-99\//)
const first = await fetch(base + "/research"), second = await fetch(base + "/research")
const nonce = /'nonce-([^']+)'/.exec(first.headers.get("content-security-policy"))?.[1]
assert.ok(nonce)
assert.notEqual(first.headers.get("content-security-policy"), second.headers.get("content-security-policy"))
const html = await first.text()
for (const script of html.matchAll(/<script\b([^>]*)>/g)) assert.ok(script[1].includes(`nonce="${nonce}"`), "CSP nonce missing from script")
await state({ revoked: id })
for (const path of [`/research/${id}`, `/api/content/research/${id}/pdf?source=external`]) {
  assert.equal((await fetch(base + path)).status, 404, "withdrawn report remains readable")
}
const event = JSON.stringify({ type: "page.properties_updated", entity: { type: "page", id } })
const signature = `sha256=${createHmac("sha256", "local-scale-webhook-test-only").update(event).digest("hex")}`
const hook = await fetch(base + "/api/notion/webhook", { method: "POST", headers: { "x-notion-signature": signature }, body: event })
assert.equal(hook.status, 200)
assert.equal((await hook.json()).queued, true)
assert.ok(!(await (await fetch(base + "/research")).text()).includes(`href="/research/${id}`), "webhook did not clear cached list")
assert.equal((await fetch(base + "/api/notion/webhook", { method: "POST", body: event })).status, 401)
await state({ revoked: "" })
console.log("PASS: 500 requests, PDF ranges, fresh CSP nonces, immediate withdrawal, signed webhook queue and invalidation")
