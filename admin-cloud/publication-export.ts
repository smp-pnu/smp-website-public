import { timingSafeEqual } from "node:crypto"
import { HttpError } from "../admin-server/validation"
import { ApprovedReportSource } from "./publication-source"
import type { Env } from "./worker"
import type { DriveUploads } from "./drive/uploads"
import { sha256 } from "./protocol"

// Disabled until a dedicated read-only export key is explicitly configured.
// It grants no edits, no draft access and no arbitrary Drive-file access.
export async function publicationExport(request: Request, env: Env, drive: DriveUploads, now: number) {
  if (!env.REPORT_EXPORT_KEY || !/^[a-f0-9]{64}$/.test(env.REPORT_EXPORT_KEY)) throw new HttpError(404,"Not found")
  if (request.method !== "GET") throw new HttpError(405,"Method not allowed")
  const key = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  if (!/^[a-f0-9]{64}$/.test(key) || !timingSafeEqual(Buffer.from(key),Buffer.from(env.REPORT_EXPORT_KEY))) throw new HttpError(401,"Unauthorized")
  let scope: {ids:string[]; expires:number}
  try { scope=JSON.parse(env.REPORT_EXPORT_SCOPE??"") } catch { throw new HttpError(404,"Export disabled") }
  if (!Array.isArray(scope?.ids) || scope.ids.length<1 || scope.ids.length>2 || scope.ids.some(id=>typeof id!=="string"||!/^[a-f0-9]{32}$/.test(id))
    || !Number.isSafeInteger(scope.expires) || scope.expires<=now || scope.expires>now+86_400_000) throw new HttpError(404,"Export expired or disabled")
  for (const [period,limit] of [[60_000,300],[86_400_000,1600]] as const) {
    const bucket=`report-export:${period}:${Math.floor(now/period)}`
    const hit=await env.ADMIN_DB.prepare("INSERT INTO usage(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits")
      .bind(bucket,(Math.floor(now/period)+1)*period,limit).first()
    if (!hit) throw new HttpError(429,"Export budget exhausted")
  }
  const source = new ApprovedReportSource(env.ADMIN_DB,drive,now), path = new URL(request.url).pathname
  if (path === "/api/publisher/reports") {
    const snapshot=await source.snapshot()
    const reports=snapshot.reports.filter(r=>scope.ids.includes(r.id))
    return Response.json({...snapshot,reports,fingerprint:await sha256(new TextEncoder().encode(JSON.stringify(reports)))})
  }
  const match = /^\/api\/publisher\/reports\/([a-f0-9]{32})\/([1-9]\d{0,9})\/pdf\/(\d{1,3})$/.exec(path)
  if (!match) throw new HttpError(404,"Not found")
  if(!scope.ids.includes(match[1]))throw new HttpError(404,"Not found")
  return new Response(await source.part(match[1],Number(match[2]),Number(match[3])),{headers:{"Content-Type":"application/octet-stream"}})
}
