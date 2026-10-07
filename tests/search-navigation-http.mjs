// Run with a local production server preloaded with tests/scale-fixture.mjs.
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { createHmac } from "node:crypto"

const base = "http://127.0.0.1:3211"
const stateFile = process.env.SMP_TEST_STATE
if (!stateFile) throw new Error("Set SMP_TEST_STATE to the local fixture state file")

async function invalidateCatalog() {
  const body = JSON.stringify({ type: "page.properties_updated", entity: { type: "page", id: "a0000000000000000000000000000001" } })
  const signature = `sha256=${createHmac("sha256", "local-scale-webhook-test-only").update(body).digest("hex")}`
  assert.equal((await fetch(`${base}/api/notion/webhook`, {
    method: "POST", headers: { "x-notion-signature": signature }, body,
  })).status, 200)
}

try {
  await writeFile(stateFile, JSON.stringify({ listDelayMs: 300 }))
  await invalidateCatalog()
  const start = performance.now()
  const response = await fetch(`${base}/search?q=${encodeURIComponent("[검증용]")}`)
  assert.equal(response.status, 200)
  const decoder = new TextDecoder()
  const times = {}
  let html = ""
  for await (const chunk of response.body) {
    html += decoder.decode(chunk, { stream: true })
    for (const [name, marker] of Object.entries({
      form: 'id="search-query"',
      loading: "검색결과를 불러오는 중입니다",
      results: "검색 결과 900건",
    })) {
      if (html.includes(marker)) times[name] ??= Math.round(performance.now() - start)
    }
  }
  console.log(JSON.stringify({ scenario: "slow full search", status: response.status, times, reports: 600, notices: 300 }))
  assert.ok(times.loading !== undefined, "A slow search must announce its loading state")
  assert.ok(times.form < times.results - 1000, "The search form must render before the slow catalogue finishes")
  assert.ok(times.loading < times.results - 1000, "Loading feedback must render before the results")
  assert.ok(html.includes("[검증용] 리포트 600"), "Full results must not be limited to the six previews")

  await writeFile(stateFile, JSON.stringify({ unavailable: true }))
  await invalidateCatalog()
  const failed = await (await fetch(`${base}/search?q=ABOUT`)).text()
  assert.ok(failed.includes("공지·리포트 검색 결과 일부를 불러오지 못했습니다."))
  assert.ok(failed.includes('href="/about"'), "Static search must still work when Notion is unavailable")
  console.log("PASS: search failure is visible and static results remain available")
} finally {
  await writeFile(stateFile, "{}")
  await invalidateCatalog()
}
