import { getSiteSearchIndex } from "@/lib/site-search"
import { guardPublicRequest } from "@/lib/request-security"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const denied = guardPublicRequest(request, "search")
  if (denied) return denied
  const index = await getSiteSearchIndex()
  // Publication changes use the shared catalog TTL; browsers do not persist it.
  return Response.json(index, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}
