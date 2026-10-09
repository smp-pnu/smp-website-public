import { reconcileContent } from "@/lib/content-tasks"
import { authorizedSync } from "@/lib/webhook-security"
import { pdfHeaders } from "@/lib/pdf-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  if (!authorizedSync(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: pdfHeaders })
  try {
    const result = await reconcileContent()
    console.info("[SMP CMS] cover reconciliation", result)
    return Response.json(result, { status: result.failed ? 503 : 200, headers: pdfHeaders })
  } catch { return Response.json({ error: "Cover sync unavailable" }, { status: 503, headers: pdfHeaders }) }
}
