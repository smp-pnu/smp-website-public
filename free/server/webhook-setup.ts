import { createHash } from "node:crypto"
import { sealToken } from "../../lib/webhook-security"
import type { Env } from "./types"

// Disabled in normal operation. A short-lived server Secret opens enrollment,
// but never authenticates events or changes the active verification token.
// The operator must verify the captured candidate in Notion's own UI first.
export async function captureWebhookVerification(raw: string, env: Env): Promise<Response | null> {
  if (!env.NOTION_WEBHOOK_SETUP) return null
  let setup: { secret?: string; expiresAt?: number }, body: { verification_token?: string }
  try { setup = JSON.parse(env.NOTION_WEBHOOK_SETUP); body = JSON.parse(raw) } catch { return null }
  const now = Date.now(), token = body?.verification_token
  if (typeof setup?.secret !== "string" || setup.secret.length < 32 ||
      typeof setup.expiresAt !== "number" || setup.expiresAt <= now || setup.expiresAt > now + 15 * 60_000 ||
      typeof token !== "string" || !/^secret_[A-Za-z0-9_-]{20,200}$/.test(token) || Object.keys(body).length !== 1) return null
  const id = createHash("sha256").update(setup.secret).digest("hex")
  // First candidate wins. An unauthenticated request can never replace it.
  await env.CMS_DB.prepare("INSERT OR IGNORE INTO free_webhook_setup(id,sealed_token,expires_at) VALUES(?,?,?)")
    .bind(id, sealToken(token, setup.secret).toString("base64"), setup.expiresAt).run()
  return Response.json({ verificationReceived: true })
}
