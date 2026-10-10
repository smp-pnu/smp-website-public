import { test } from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import type { Env } from "../free/server/types"
import { captureWebhookVerification } from "../free/server/webhook-setup"
import { openToken } from "../lib/webhook-security"

test("webhook enrollment is temporary, encrypted, first-write-only and cannot authenticate events", async () => {
  const db = new DatabaseSync(":memory:")
  db.exec(readFileSync(new URL("../cloudflare/migrations/0005_webhook_setup.sql", import.meta.url), "utf8"))
  const secret = "temporary-enrollment-secret-at-least-32-characters"
  const setup = JSON.stringify({ secret, expiresAt: Date.now() + 600_000 })
  const token = "secret_realCandidateFromNotion123456789"
  const raw = JSON.stringify({ verification_token: token })
  const env = { CMS_DB: { prepare: (sql: string) => ({ bind: (...values: any[]) => ({ run: async () => db.prepare(sql).run(...values) }) }) } } as unknown as Env
  try {
    assert.equal(await captureWebhookVerification(raw, env), null)
    for (const config of ["invalid", "null", JSON.stringify({secret,expiresAt:Date.now()-1}), JSON.stringify({secret,expiresAt:Date.now()+3600_000}), JSON.stringify({secret:"short",expiresAt:Date.now()+60_000})]) {
      env.NOTION_WEBHOOK_SETUP=config
      assert.equal(await captureWebhookVerification(raw,env),null)
    }
    env.NOTION_WEBHOOK_SETUP=setup
    for (const body of ["null", "[]", "{}", JSON.stringify({verification_token:token,type:"page.deleted"}), JSON.stringify({verification_token:"bad"})]) assert.equal(await captureWebhookVerification(body,env),null)
    assert.equal((await captureWebhookVerification(raw,env))?.status,200)
    assert.equal((await captureWebhookVerification(JSON.stringify({verification_token:"secret_otherCandidateCannotReplace123456"}),env))?.status,200)
    const rows=db.prepare("SELECT sealed_token FROM free_webhook_setup").all()
    assert.equal(rows.length,1)
    assert.ok(!JSON.stringify(rows).includes(token))
    assert.equal(openToken(Buffer.from(rows[0].sealed_token as string,"base64"),secret),token)
    assert.equal(env.NOTION_WEBHOOK_VERIFICATION_TOKEN,undefined)
  } finally { db.close() }
})
