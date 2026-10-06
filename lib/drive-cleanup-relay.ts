import "server-only"
import { createHmac } from "node:crypto"
import { normalizeId } from "./content-model"

// Apps Script owns Drive authorization. This server only relays a signed page
// ID; the worker independently reads Notion and verifies the PDF and its folder.
export async function queueDriveCleanup(rawId: string) {
  const endpoint = process.env.DRIVE_CLEANUP_WEB_APP_URL
  if (!endpoint) return
  const id = normalizeId(rawId)
  const token = process.env.NOTION_TOKEN
  if (!id || !token || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
    throw new Error("Drive cleanup is not configured correctly")
  }
  const payload = JSON.stringify({ version: 1, pageId: id, issuedAt: Date.now() })
  const signature = createHmac("sha256", token).update(`smp-drive-cleanup-v1\n${payload}`).digest("hex")
  const response = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, signature }), cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error("Drive cleanup queue unavailable")
  const result = await response.json()
  if (result?.ok !== true) throw new Error("Drive cleanup queue rejected the event")
}
