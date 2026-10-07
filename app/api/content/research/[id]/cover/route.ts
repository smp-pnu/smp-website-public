import { driveCoverUrl, fetchReportCover } from "@/lib/report-cover"
import { pdfHeaders } from "@/lib/pdf-response"
import { getContentItem } from "@/lib/notion"
import { savedReportCover } from "@/lib/saved-cover-reader"
import { guardPublicRequest } from "@/lib/request-security"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardPublicRequest(request, "cover")
  if (denied) return denied
  try {
    const id = (await params).id
    const item = await getContentItem("research", id)
    if (!item) return new Response("Not found", { status: 404, headers: pdfHeaders })
    const reader = new URL(request.url).searchParams.get("size") === "reader"
    // Public reads never download/parse a PDF or write to Blob. Generation is
    // restricted to signed webhooks and the authenticated reconciliation job.
    const saved = await savedReportCover(item)
    const image = reader ? saved?.preview : saved
    if (image) return new Response(null, { status: 307, headers: { ...pdfHeaders, Location: image.url } })
    const url = driveCoverUrl(item)
    if (!url) return new Response("Not found", { status: 404, headers: pdfHeaders })
    const cover = await fetchReportCover(reader ? url.replace("w480", "w1024") : url, AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]))
    return new Response(new Uint8Array(cover.bytes), { headers: {
      ...pdfHeaders,
      "Content-Type": cover.type,
      "Content-Disposition": "inline",
    } })
  } catch {
    return new Response("Cover unavailable", { status: 503, headers: pdfHeaders })
  }
}
