import type { Database } from "../../cloudflare/bindings"
import { Busy, type Env } from "./types"

const closedUntil = new Map<string, number>()
// Reserve both CMS windows in one atomic statement. Normal requests need one
// D1 round trip instead of separate backoff, minute and day budget queries.
export async function notionBudget(db:Database,now=Date.now()) {
  const windows=[["notion-minute",120,60_000],["notion-day",8_000,86_400_000]] as const
  const limits=windows.map(([name,limit,ms])=>({key:`${name}:${Math.floor(now/ms)}`,limit,reset:(Math.floor(now/ms)+1)*ms}))
  const rows=await db.prepare(`WITH limits(key,lim,reset) AS MATERIALIZED (VALUES (?,?,?),(?,?,?))
    INSERT INTO free_budget(key,count,expires_at)
    SELECT key,1,reset FROM limits WHERE
      NOT EXISTS(SELECT 1 FROM free_controls WHERE name='notion-backoff' AND until_at>?) AND
      NOT EXISTS(SELECT 1 FROM free_budget JOIN limits ON free_budget.key=limits.key WHERE count>=lim)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING key`)
    .bind(...limits.flatMap(w=>[w.key,w.limit,w.reset]),now).all<{key:string}>()
  if(rows.results.length===2)return
  if(rows.results.length)throw new Error("Incomplete CMS budget reservation")
  const paused=await db.prepare(`SELECT MAX(until_at) AS until_at FROM (
    SELECT until_at FROM free_controls WHERE name='notion-backoff'
    UNION ALL SELECT expires_at FROM free_budget WHERE (key=? AND count>=?) OR (key=? AND count>=?))`)
    .bind(limits[0].key,limits[0].limit,limits[1].key,limits[1].limit).first<{until_at:number|null}>()
  throw new Busy(Math.max(1,Math.ceil(((paused?.until_at??now+60_000)-now)/1000)))
}
export async function spend(db: Database, name: string, limit: number, windowMs: number, amount = 1, now = Date.now()) {
  if (![limit, windowMs, amount].every(value => Number.isSafeInteger(value) && value > 0) || amount > limit) throw new Busy(60)
  if ((closedUntil.get(name) ?? 0) > now) throw new Busy(Math.ceil((closedUntil.get(name)! - now) / 1000))
  const reset = (Math.floor(now / windowMs) + 1) * windowMs
  const key = `${name}:${Math.floor(now / windowMs)}`
  const row = await db.prepare(`INSERT INTO free_budget(key, count, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + excluded.count WHERE count + excluded.count <= ? RETURNING count`)
    .bind(key, amount, reset, limit).first<{ count: number }>()
  if (!row || row.count > limit) {
    if (closedUntil.size > 32) closedUntil.clear()
    closedUntil.set(name, reset)
    throw new Busy(Math.ceil((reset - now) / 1000))
  }
}

export async function publicBudget(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
  if (["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "") && request.headers.get("sec-fetch-mode") !== "navigate") return new Response("Forbidden", { status: 403 })
  const ip = request.headers.get("cf-connecting-ip") ?? "local"
  if (env.API_RATE_LIMIT && !(await env.API_RATE_LIMIT.limit({ key: ip })).success) throw new Busy(60)
  // Safety margin below the provider's 100k/day request and D1 write limits.
  // Static files bypass this API entirely. This is not an account-abuse guarantee.
  await spend(env.CMS_DB, "public-api-day", 12_000, 86_400_000)
  return null
}
