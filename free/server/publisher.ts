import { spend } from "./budget"
import { Busy, type Env } from "./types"

const COOLDOWN = 15*60_000
const WORKFLOW = "https://api.github.com/repos/smp-pnu/smp-website-public/actions/workflows/free-publish.yml/dispatches"

// This only requests the existing trusted workflow. No source, branch, input
// or credential destination can be chosen by a webhook or a website visitor.
export async function requestPublisher(env: Env) {
  if (env.SMP_READ_ONLY==="1" || !env.GITHUB_PUBLISH_TOKEN) return "disabled" as const
  const now = Date.now(), until = now+COOLDOWN
  try {
    const claimed = await env.CMS_DB.prepare(`INSERT INTO free_controls(name,until_at)
      SELECT 'publisher-dispatch',? WHERE
        (EXISTS(SELECT 1 FROM ${env.CMS_ADMIN_MODE?"cms_jobs":"free_jobs"} WHERE attempts<${env.CMS_ADMIN_MODE?3:5} AND next_at<=? AND lease_until<=?)
          OR ${env.CMS_ADMIN_MODE?"EXISTS(SELECT 1 FROM free_admin_config WHERE name='recruitment_validated' AND value<>COALESCE((SELECT value FROM free_admin_config WHERE name='recruitment_deployed'),''))":"EXISTS(SELECT 1 FROM free_controls WHERE name LIKE 'publish-at:%' AND until_at<=?)"})
        AND NOT EXISTS(SELECT 1 FROM free_controls WHERE name='publisher' AND until_at>?)
      ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at
        WHERE free_controls.until_at<=? RETURNING until_at`)
      .bind(until,now,now,...(env.CMS_ADMIN_MODE?[]:[now]),now,now).first()
    if (!claimed) return "idle" as const
    try {
      await spend(env.CMS_DB,"publish-dispatch-day",12,86_400_000)
    } catch(error) {
      if (!(error instanceof Busy)) throw error
      await env.CMS_DB.prepare("UPDATE free_controls SET until_at=? WHERE name='publisher-dispatch' AND until_at=?")
        .bind(Math.max(until,now+error.seconds*1000),until).run()
      return "paused" as const
    }
    const response = await (env.PUBLISH_FETCH ?? fetch)(WORKFLOW,{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(10_000),
      headers:{Authorization:`Bearer ${env.GITHUB_PUBLISH_TOKEN}`,Accept:"application/vnd.github+json",
        "X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json","User-Agent":"SMP-CMS-Publisher"},
      body:JSON.stringify({ref:"main"}),
    })
    // GitHub's current API returns 200 with a run ID; older versions returned
    // 204. Do not follow redirects or copy upstream response bodies to logs.
    await response.body?.cancel()
    if (response.status!==200 && response.status!==204) {
      const retryAfter=response.headers.get("retry-after")
      const seconds=retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null
      const retryAt=seconds===null ? Date.parse(retryAfter??"") : Date.now()+seconds*1000
      const reset=Number(response.headers.get("x-ratelimit-remaining"))===0
        ? Number(response.headers.get("x-ratelimit-reset"))*1000 : 0
      const blockedUntil=Math.max(until,Number.isSafeInteger(retryAt)?retryAt:0,Number.isSafeInteger(reset)?reset:0)
      await env.CMS_DB.prepare("UPDATE free_controls SET until_at=? WHERE name='publisher-dispatch' AND until_at=?")
        .bind(blockedUntil,until).run()
      console.warn("[SMP free] publisher request deferred",response.status)
      return "deferred" as const
    }
    return "requested" as const
  } catch {
    // The durable queue survives timeout, invalid credentials and GitHub
    // outages. Cron retries after the cooldown; webhook delivery still ends.
    console.warn("[SMP free] publisher request unavailable; queued work retained")
    return "deferred" as const
  }
}
