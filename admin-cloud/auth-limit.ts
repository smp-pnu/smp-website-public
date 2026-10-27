import { HttpError } from "../admin-server/validation"
import { sha256 } from "./protocol"

export type AuthLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> }
export async function limitAuth(request: Request, limiter: AuthLimiter, salt: string) {
  // Cloudflare supplies this header at ingress. Never trust X-Forwarded-For or
  // a client-supplied account/cookie as a way to obtain another request budget.
  const ip = request.headers.get("CF-Connecting-IP")
  if (!limiter || !ip || ip.length > 64) throw new HttpError(503, "로그인 보호 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.")
  const path = new URL(request.url).pathname
  const lane = path.endsWith("/verify") ? "proof" : path.includes("/reauth/") || path.endsWith("/remove") ? "security" : request.method === "GET" ? "status" : "start"
  const actor = await sha256(new TextEncoder().encode(`${salt}:auth-limit:${ip}`))
  if (!(await limiter.limit({ key: `${lane}:${actor}` })).success)
    throw new HttpError(429, "로그인 요청이 많아요. 1분 후 다시 시도해 주세요.")
}
