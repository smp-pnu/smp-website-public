import { reconcileReportCovers } from "@/lib/cover-service"
import { authorizedSync } from "@/lib/webhook-security"
import { pdfHeaders } from "@/lib/pdf-response"
import { syncResearchOrder } from "@/lib/research-order-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  if (!authorizedSync(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: pdfHeaders })
  // Reuse the existing daily job to recover a missed ordering webhook.
  let order
  try { order = await syncResearchOrder() } catch { order = { failed: true } }
  try {
    const result = await reconcileReportCovers()
    return Response.json({ ...result, order }, { status: result.failed || "failed" in order ? 503 : 200, headers: pdfHeaders })
  } catch { return Response.json({ error: "Cover sync unavailable" }, { status: 503, headers: pdfHeaders }) }
}
