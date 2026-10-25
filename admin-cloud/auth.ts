import { HttpError } from "../admin-server/validation"
import { sha256 } from "./protocol"

export type AccessConfig = { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; ADMIN_EMAIL?: string }
type Key = JsonWebKey & { kid?: string }
const keyCache = new Map<string, { expires: number; keys: Key[] }>()
const decode = (part: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw Error("Invalid JWT encoding")
  return Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))
}
export function accessConfigured(env: AccessConfig) {
  return !!env.ACCESS_AUD && /^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN ?? "") && /^[^\s@]+@[^\s@]+$/.test(env.ADMIN_EMAIL ?? "")
}
export async function identity(request: Request, env: AccessConfig, fetcher = fetch, now = Date.now()) {
  if (!accessConfigured(env)) throw new HttpError(503, "시험 사이트의 관리자 접근 설정을 준비 중입니다.")
  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? ""
  if (!token || token.length > 16_384) throw new HttpError(401, "관리자 이메일로 로그인해 주세요.")
  try {
    const [headerPart, bodyPart, signaturePart, extra] = token.split(".")
    if (extra !== undefined || !signaturePart) throw Error("Invalid JWT")
    const header = JSON.parse(new TextDecoder().decode(decode(headerPart)))
    const claims = JSON.parse(new TextDecoder().decode(decode(bodyPart)))
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 200) throw Error("Invalid algorithm")
    if (claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD)
      || typeof claims.exp !== "number" || claims.exp <= now / 1000 || typeof claims.iat !== "number" || claims.iat > now / 1000 + 60
      || (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > now / 1000 + 60))
      || typeof claims.sub !== "string" || typeof claims.email !== "string" || claims.email.toLowerCase() !== env.ADMIN_EMAIL!.toLowerCase()) throw Error("Invalid claims")
    let cached = keyCache.get(issuer)
    if (!cached || cached.expires < now) {
      const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000), redirect: "manual" })
      if (!response.ok) throw Error("Unavailable keys")
      const text = await response.text()
      if (text.length > 64_000) throw Error("Invalid keys")
      const jwks = JSON.parse(text)
      if (!Array.isArray(jwks.keys) || jwks.keys.length > 10) throw Error("Invalid keys")
      cached = { keys: jwks.keys, expires: now + 5 * 60_000 }
      keyCache.set(issuer, cached)
    }
    const jwk = cached.keys.find(k => k.kid === header.kid && k.kty === "RSA")
    if (!jwk) throw Error("Unknown key")
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(signaturePart), new TextEncoder().encode(`${headerPart}.${bodyPart}`))) throw Error("Bad signature")
    return { username: claims.email as string, csrf: await sha256(new TextEncoder().encode(`smp-admin-cloud-csrf:${token}`)) }
  } catch { throw new HttpError(401, "로그인 인증을 확인하지 못했어요. 다시 로그인해 주세요.") }
}
