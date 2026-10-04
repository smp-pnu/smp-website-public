import { syncResearchOrder } from "@/lib/research-order-service"
import { authorizedSync } from "@/lib/webhook-security"
import { pdfHeaders } from "@/lib/pdf-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Initial setup/recovery only. Normal edits use signed Notion webhooks.
export async function POST(request: Request) {
  if (!authorizedSync(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: pdfHeaders })
  try {
    const result = await syncResearchOrder()
    return Response.json(result, { status: result.configured ? 200 : 503, headers: pdfHeaders })
  } catch { return Response.json({ error: "Order sync unavailable" }, { status: 503, headers: pdfHeaders }) }
}
