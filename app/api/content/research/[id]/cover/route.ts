import { fetchReportCover, getReportCoverUrl } from "@/lib/report-cover"
import { pdfHeaders } from "@/lib/pdf-response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = await getReportCoverUrl((await params).id)
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
