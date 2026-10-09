// Bounded read-only probe of the named fixture deployment, never production.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"

const base = "https://smp-fixture-preview.smp-website.workers.dev"
const run = Date.now().toString(36)
const id = "a0000000000000000000000000000001"
const routes = {
  research: "/research",
  detail: `/research/${id}`,
  pdf: `/api/content/research/${id}/pdf?source=external`,
}
const requests = []
async function probe(kind, phase, range = false) {
  const url = new URL(routes[kind], base)
  url.searchParams.set("trial", run)
  url.searchParams.set("phase", phase)
  const start = performance.now()
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: range ? { range: "bytes=0-99" } : {} })
  const body = await response.arrayBuffer()
  const record = { kind, phase, status: response.status, ms: Math.round(performance.now() - start), bytes: body.byteLength }
  requests.push(record)
  assert.equal(response.status, range ? 206 : 200, JSON.stringify(record))
  assert.match(response.headers.get("x-robots-tag"), /noindex/)
  if (kind === "pdf") {
    assert.equal(new TextDecoder().decode(body.slice(0, 5)), "%PDF-")
    if (range) { assert.equal(body.byteLength, 100); assert.match(response.headers.get("content-range"), /^bytes 0-99\//) }
  } else assert.ok(new TextDecoder().decode(body).includes("[검증용]"))
}

for (let i = 0; i < 5; i++) await probe("research", "serial")
await probe("pdf", "range", true)
// 100 visitors each request one resource: 50 lists, 30 details, 20 PDFs.
const results = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => probe(i < 50 ? "research" : i < 80 ? "detail" : "pdf", "burst")))
const failures = results.filter(result => result.status === "rejected").map(result => String(result.reason))
const summary = Object.keys(routes).map(kind => {
  const values = requests.filter(record => record.kind === kind && record.phase === "burst").map(record => record.ms).sort((a, b) => a - b)
  return { kind, count: values.length, p50ms: values[Math.ceil(values.length * .5) - 1], p95ms: values[Math.ceil(values.length * .95) - 1] }
})
await mkdir("test-results", { recursive: true })
await writeFile("test-results/cloudflare-remote.json", JSON.stringify({ base, run, date: new Date().toISOString(), summary, failures, requests }, null, 2))
console.log(JSON.stringify({ run, summary, failures }, null, 2))
assert.equal(failures.length, 0, "Remote requests failed; inspect test-results/cloudflare-remote.json")
