import type { Database } from "../../cloudflare/bindings"
import { Busy, type Env } from "./types"

const closedUntil = new Map<string, number>()
// The workload limits sum to the global limits, reserving capacity for the
// background synchronizers even when visitors exhaust their allowance.
const workloads = { visitor: [100,1800], sync: [5,4500], publisher: [30,1200], webhook: [15,500] } as const
export async function notionBudget(db:Database,now=Date.now(),workload:NonNullable<Env["NOTION_WORKLOAD"]>="visitor") {
  const [minute,day]=workloads[workload]
  const windows=[["notion-minute",150,60_000],["notion-day",8_000,86_400_000],[`notion-${workload}-minute`,minute,60_000],[`notion-${workload}-day`,day,86_400_000]] as const
  const limits=windows.map(([name,limit,ms])=>({key:`${name}:${Math.floor(now/ms)}`,limit,reset:(Math.floor(now/ms)+1)*ms}))
  const rows=await db.prepare(`WITH limits(key,lim,reset) AS MATERIALIZED (VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?))
    INSERT INTO free_budget(key,count,expires_at)
    SELECT key,1,reset FROM limits WHERE
      NOT EXISTS(SELECT 1 FROM free_controls WHERE name='notion-backoff' AND until_at>?) AND
      NOT EXISTS(SELECT 1 FROM free_budget JOIN limits ON free_budget.key=limits.key WHERE count>=lim)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING key`)
    .bind(...limits.flatMap(w=>[w.key,w.limit,w.reset]),now).all<{key:string}>()
  if(rows.results.length===4)return
  if(rows.results.length)throw new Error("Incomplete CMS budget reservation")
  const paused=await db.prepare(`SELECT MAX(until_at) AS until_at FROM (
    SELECT until_at FROM free_controls WHERE name='notion-backoff'
    UNION ALL SELECT expires_at FROM free_budget WHERE ${limits.map(()=>"(key=? AND count>=?)").join(" OR ")} )`)
    .bind(...limits.flatMap(limit=>[limit.key,limit.limit])).first<{until_at:number|null}>()
  throw new Busy(Math.max(1,Math.ceil(((paused?.until_at??now+60_000)-now)/1000)))
}
type Reference = { id:string; kind:string }
export async function spend(db: Database, name: string, limit: number, windowMs: number, amount = 1, now = Date.now(), reference?:Reference) {
  if (![limit, windowMs, amount].every(value => Number.isSafeInteger(value) && value > 0) || amount > limit) throw new Busy(60)
  if ((closedUntil.get(name) ?? 0) > now) throw new Busy(Math.ceil((closedUntil.get(name)! - now) / 1000))
  const reset = (Math.floor(now / windowMs) + 1) * windowMs
  const key = `${name}:${Math.floor(now / windowMs)}`
  const row = await db.prepare(`INSERT INTO free_budget(key, count, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + excluded.count WHERE count + excluded.count <= ? RETURNING count
    ${reference?", EXISTS(SELECT 1 FROM free_content WHERE id=? AND kind=?) AS known":""}`)
    .bind(key, amount, reset, limit,...(reference?[reference.id,reference.kind]:[])).first<{ count: number; known?:number }>()
  if (!row || row.count > limit) {
    if (closedUntil.size > 32) closedUntil.clear()
    closedUntil.set(name, reset)
    throw new Busy(Math.ceil((reset - now) / 1000))
  }
  return !reference || !!row.known
}

export async function publicBudget(request: Request, env: Env, reference?:Reference) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
  if (["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "") && request.headers.get("sec-fetch-mode") !== "navigate") return new Response("Forbidden", { status: 403 })
  const ip = request.headers.get("cf-connecting-ip") ?? "local"
  if (env.API_RATE_LIMIT && !(await env.API_RATE_LIMIT.limit({ key: ip })).success) throw new Busy(60)
  // Safety margin below the provider's 100k/day request and D1 write limits.
  // Static files bypass this API entirely. This is not an account-abuse guarantee.
  // Validate a requested article in this same database round trip, before a
  // live CMS lookup. Random IDs spend no Notion quota; valid PDFs avoid a
  // separate D1 response deserialization on every range request.
  if(!await spend(env.CMS_DB, "public-api-day", 24_000, 86_400_000,1,Date.now(),reference)) return new Response("Not found",{status:404})
  return null
}
