import { coverStore, coverStorageEnabled } from "@/lib/cover-store"
import { syncReportCover } from "@/lib/cover-service"
import { authorizedSync, limitedBody, openToken, sameSecret, sealToken, validNotionSignature } from "@/lib/webhook-security"
import { pdfHeaders } from "@/lib/pdf-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
const setupPath = "setup/notion-verification.enc"
const reply = (body: object, status = 200) => Response.json(body, { status, headers: pdfHeaders })

export async function POST(request: Request) {
  if (!sameSecret(new URL(request.url).searchParams.get("key"), process.env.CRON_SECRET)) return reply({ error: "Unauthorized" }, 401)
  if (!coverStorageEnabled()) return reply({ error: "Storage unavailable" }, 503)
  try {
    const raw = await limitedBody(request)
    const event = JSON.parse(raw)
    const token = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN
    if (!token && typeof event.verification_token === "string" && /^secret_[\w-]{20,200}$/.test(event.verification_token)) {
      const existing = await coverStore.read(setupPath)
      if (existing && openToken(existing.bytes, process.env.CRON_SECRET!) !== event.verification_token) return reply({ error: "Handshake already pending" }, 409)
      if (!existing) await coverStore.write(setupPath, sealToken(event.verification_token, process.env.CRON_SECRET!), "application/octet-stream")
      return reply({ received: true })
    }
    if (!validNotionSignature(raw, request.headers.get("x-notion-signature"), token)) return reply({ error: "Invalid signature" }, 401)
    if (event.entity?.type !== "page" || typeof event.entity?.id !== "string" || !/^page\./.test(event.type)) return reply({ ignored: true })
    // Fetch current source-scoped content; delayed/duplicate events cannot
    // republish an old state. Failures return 503 so Notion can retry.
    const cover = await syncReportCover(event.entity.id, true)
    return reply({ received: true, prepared: !!cover })
  } catch {
    return reply({ error: "Cover update unavailable" }, 503)
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
