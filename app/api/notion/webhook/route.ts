import { coverStore, coverStorageEnabled } from "@/lib/cover-store"
import { syncReportCover } from "@/lib/cover-service"
import { authorizedSync, limitedBody, openToken, sealToken, validNotionSignature } from "@/lib/webhook-security"
import { pdfHeaders } from "@/lib/pdf-response"
import { revalidateTag } from "next/cache"
import { contentCacheTag } from "@/lib/content-catalog"
import { queueDriveCleanup } from "@/lib/drive-cleanup-relay"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120
const setupPath = "setup/notion-verification.enc"
const reply = (body: object, status = 200) => Response.json(body, { status, headers: pdfHeaders })

export async function POST(request: Request) {
  try {
    const raw = await limitedBody(request)
    const event = JSON.parse(raw)
    const token = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN
    if (!token && typeof event.verification_token === "string" && /^secret_[\w-]{20,200}$/.test(event.verification_token)) {
      // Notion's initial handshake is unsigned. It only stages ciphertext;
      // an authenticated administrator must verify it in Notion and install
      // the token before any event can run. Never share CRON_SECRET in a URL.
      if (!coverStorageEnabled() || !process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) return reply({ error: "Setup unavailable" }, 503)
      const existing = await coverStore.read(setupPath)
      if (existing && openToken(existing.bytes, process.env.CRON_SECRET!) !== event.verification_token) return reply({ error: "Handshake already pending" }, 409)
      if (!existing) await coverStore.write(setupPath, sealToken(event.verification_token, process.env.CRON_SECRET!), "application/octet-stream")
      return reply({ received: true })
    }
    if (!validNotionSignature(raw, request.headers.get("x-notion-signature"), token)) return reply({ error: "Invalid signature" }, 401)
    if (event.entity?.type !== "page" || typeof event.entity?.id !== "string" || !/^page\./.test(event.type)) return reply({ ignored: true })
    // Invalidate notices as well as reports, even during a Blob outage.
    revalidateTag(contentCacheTag, { expire: 0 })
    // Retain deletion hints even for a page created and deleted between polls.
    // The worker checks current state; unpublishing never enqueues a deletion.
    if (event.type === "page.deleted") await queueDriveCleanup(event.entity.id)
    if (!coverStorageEnabled()) return reply({ received: true, prepared: false })
    // Fetch current source-scoped content; delayed/duplicate events cannot
    // republish an old state. Failures return 503 so Notion can retry.
    const cover = await syncReportCover(event.entity.id, true)
    return reply({ received: true, prepared: !!cover })
  } catch {
    return reply({ error: "Content update unavailable" }, 503)
  }
}

export async function GET(request: Request) {
  if (!authorizedSync(request)) return reply({ error: "Unauthorized" }, 401)
  if (process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN) return reply({ configured: true })
  try {
    const stored = await coverStore.read(setupPath)
    return stored ? reply({ verification_token: openToken(stored.bytes, process.env.CRON_SECRET!) }) : reply({ pending: true }, 404)
  } catch { return reply({ error: "Setup unavailable" }, 503) }
}
