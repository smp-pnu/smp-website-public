import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { authorizedSync, limitedBody, openToken, sealToken, validNotionSignature } from "../lib/webhook-security"
import { GET as sync } from "../app/api/cron/report-covers/route"
import { POST as webhook, GET as setup } from "../app/api/notion/webhook/route"

const secret = "test-only-secret-12345678901234567890"
test("Notion signatures validate the raw body and reject modified, missing or malformed signatures", () => {
  const body = '{"type":"page.properties_updated", "entity":{"id":"example","type":"page"}}'
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  assert.equal(validNotionSignature(body, signature, secret), true)
  for (const candidate of [null, "sha256=", "sha256=" + "a".repeat(64), "not-hex"]) assert.equal(validNotionSignature(body, candidate, secret), false)
  assert.equal(validNotionSignature(body.replace("example", "different"), signature, secret), false)
  assert.equal(validNotionSignature(body, signature, undefined), false)
})

test("one-time setup storage contains only authenticated ciphertext", () => {
  const token = "secret_notion_verification_do_not_publish"
  const sealed = sealToken(token, secret)
  assert.equal(Buffer.from(sealed).includes(Buffer.from(token)), false)
  assert.equal(openToken(sealed, secret), token)
  assert.throws(() => openToken(sealed, secret + "wrong"))
  sealed[30] ^= 1
  assert.throws(() => openToken(sealed, secret))
  assert.throws(() => sealToken(token, "short"))
})

test("sync and setup fail closed when authentication is absent or configuration is missing", async () => {
  const previous = process.env.CRON_SECRET
  try {
    for (const value of [undefined, secret]) {
      if (value) process.env.CRON_SECRET = value
      else delete process.env.CRON_SECRET
      const request = new Request("https://smp.test/api/cron/report-covers", { headers: { authorization: "Bearer undefined" } })
      assert.equal(authorizedSync(request), false)
      assert.equal((await sync(request)).status, 401)
      assert.equal((await setup(request)).status, 401)
      assert.equal((await webhook(new Request("https://smp.test/api/notion/webhook", { method: "POST", body: "{}" }))).status, 401)
    }
  } finally {
    if (previous) process.env.CRON_SECRET = previous
    else delete process.env.CRON_SECRET
  }
})

test("webhook bodies are bounded even without a Content-Length header", async () => {
  await assert.rejects(limitedBody(new Request("https://smp.test", { method: "POST", body: "x".repeat(70_000) })), /too large/)
  assert.equal(await limitedBody(new Request("https://smp.test", { method: "POST", body: "{}" })), "{}")
})
