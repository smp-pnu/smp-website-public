import { driveCoverUrl, fetchReportCover } from "@/lib/report-cover"
import { pdfHeaders } from "@/lib/pdf-response"
import { getContentItem } from "@/lib/notion"
import { ensureReportCover } from "@/lib/cover-service"
import { coverStorageEnabled } from "@/lib/cover-store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id
    const item = await getContentItem("research", id)
    if (!item) return new Response("Not found", { status: 404, headers: pdfHeaders })
    if (coverStorageEnabled()) {
      try {
        const saved = await ensureReportCover(item)
        if (saved) return new Response(null, { status: 307, headers: { ...pdfHeaders, Location: saved.url } })
      } catch { /* Storage quota/outage: retain a readable Drive cover. */ }
    }
    const url = driveCoverUrl(item)
    if (!url) return new Response("Not found", { status: 404, headers: pdfHeaders })
    const cover = await fetchReportCover(url, AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]))
    return new Response(new Uint8Array(cover.bytes), { headers: {
      ...pdfHeaders,
      "Content-Type": cover.type,
      "Content-Disposition": "inline",
    } })
  } catch {
    return new Response("Cover unavailable", { status: 503, headers: pdfHeaders })
  }
}
