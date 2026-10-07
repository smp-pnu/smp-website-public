import { guardPublicRequest } from "@/lib/request-security"
import { isTrustedAttachmentUrl } from "@/lib/pdf-source"
import { getContentItem } from "@/lib/notion"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store, max-age=0" }

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const denied = guardPublicRequest(request, "file")
  if (denied) return denied
  const { kind, id } = await params
  if (kind !== "notice" && kind !== "research") return new Response("Not found", { status: 404, headers })
  const index = Number(new URL(request.url).searchParams.get("index") ?? 0)
  if (!Number.isSafeInteger(index) || index < 0) return new Response("Not found", { status: 404, headers })
  try {
    const item = await getContentItem(kind, id)
    const file = item?.attachments[index]
    if (!file || !isTrustedAttachmentUrl(file.url)) return new Response("Not found", { status: 404, headers })
    return new Response(null, { status: 307, headers: { ...headers, Location: file.url, "Referrer-Policy": "no-referrer" } })
  } catch {
    return new Response("첨부파일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", { status: 503, headers })
  }
}
