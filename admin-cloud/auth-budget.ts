import type { Database } from "../cloudflare/bindings"
import { HttpError } from "../admin-server/validation"

// Per-IP ingress limiting runs first. This second, atomic budget bounds D1 work
// across IP addresses and Cloudflare locations; it never affects active sessions.
// One fixed row per lane, rather than one row per address or attempted credential.
const closed = new WeakMap<Database, Map<string, number>>()
export async function authBudget(db: Database, path: string, now: number) {
  const lane = path === "/api/auth/status" ? "status" : path.includes("/reauth/") || path.endsWith("/remove") ? "security" : path.endsWith("/verify") ? "proof" : "start"
  const limit = lane === "status" ? 2000 : 600
  const reset = (Math.floor(now / 86400000) + 1) * 86400000
  let blocked = closed.get(db)
  if (!blocked) { blocked = new Map(); closed.set(db, blocked) }
  const deny = (): never => { throw new HttpError(429,"로그인 보호 한도에 도달했어요. 기존 로그인은 계속 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.") }
  if ((blocked.get(lane) ?? 0) > now) deny()
  const row = await db.prepare(`INSERT INTO usage(key,hits,expires) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires<=? THEN 1 ELSE hits+1 END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END
    WHERE expires<=? OR hits<? RETURNING hits`)
    .bind(`auth-budget:${lane}`,reset,now,now,now,limit).first()
  if (!row) { blocked.set(lane,reset); deny() }
}
