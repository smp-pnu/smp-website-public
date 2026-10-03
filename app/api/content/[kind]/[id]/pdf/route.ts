import { getContentItem } from "@/lib/notion"
import { getPdfSources } from "@/lib/pdf-source"
import { pdfHeaders, streamPdf } from "@/lib/pdf-response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  if (kind !== "notice" && kind !== "research") return new Response("Not found", { status: 404, headers: pdfHeaders })
  const search = new URL(request.url).searchParams
  const query = search.get("source") === "external" ? "source=external" : `index=${search.get("index") ?? "0"}`
  try {
    const item = await getContentItem(kind, id)
    const file = item && getPdfSources(item).find(file => file.query === query)
    if (!file) return new Response("Not found", { status: 404, headers: pdfHeaders })
    return await streamPdf(file.url, file.name, search.get("download") === "1", AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]))
  } catch {
    return new Response("PDF를 불러오지 못했습니다. 잠시 후 다시 시도해주세요. 문제가 계속되면 학회에 문의해주세요.", { status: 503, headers: pdfHeaders })
  }
}
