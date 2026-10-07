// Run on port 3211 with tests/members-fixture.mjs preloaded.
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { createHmac } from "node:crypto"
const state = process.env.SMP_TEST_STATE
if (!state) throw new Error("Local fixture state is required")
const base = "http://127.0.0.1:3211"
async function update(value) {
  await writeFile(state, JSON.stringify(value))
  const body = JSON.stringify({ type: "page.properties_updated", entity: { type: "page", id: "c00000000000000000000000000000274" } })
  const signature = `sha256=${createHmac("sha256", "local-scale-webhook-test-only").update(body).digest("hex")}`
  assert.equal((await fetch(`${base}/api/notion/webhook`, { method: "POST", headers: { "x-notion-signature": signature }, body })).status, 200)
}
try {
  await update({})
  const members = await (await fetch(`${base}/members`)).text()
  assert.ok(members.includes('value="41"') && members.includes("[검증회원] 628"), "New generations appear without a code change")
  assert.ok(!members.includes("[검증회원] 1\""), "Alumni records are not sent to the current-member client")
  let index = await (await fetch(`${base}/api/search`)).json()
  assert.equal(index.entries.filter(entry => entry.label === "회원").length, 628)
  assert.equal(index.entries.find(entry => entry.title === "[검증회원] 628").href, "/members?generation=41#generation-panel")
  assert.ok(!JSON.stringify(index).includes("private-member-note"))
  await update({ memberHidden: true })
  assert.ok(!(await (await fetch(`${base}/members`)).text()).includes("[검증회원] 628"))
  index = await (await fetch(`${base}/api/search`)).json()
  assert.equal(index.entries.filter(entry => entry.label === "회원").length, 627)
  await update({ memberUnavailable: true })
  assert.ok((await (await fetch(`${base}/members`)).text()).includes("회원 명단을 불러오지 못했습니다."))
  index = await (await fetch(`${base}/api/search`)).json()
  assert.equal(index.entries.filter(entry => entry.label === "회원").length, 0)
  assert.equal(index.partial, true)
  console.log("PASS: 628 CMS members, new generation, source-specific pages, withdrawal from directory + search, no private fields, and no stale fallback on failure")
} finally { await update({}) }
