import type { ContentKind, NotionPage } from "../../lib/content-model"
import { rebuildDocuments, storePages } from "./catalog"
import { notion, source } from "./notion"
import { Busy, type Env } from "./types"

type Kind = ContentKind | "members"
type State = { watermark: string; cursor: string | null; started_at: number | null; checked_at: number }
type Batch = { results: NotionPage[]; has_more: boolean; next_cursor: string | null }
type Outcome = "complete" | "partial" | "superseded" | "paused" | "error"
const MINUTE = 60_000
const LEASE_MS = 90_000
const nextMinute = (now: number, minutes: number) => (Math.floor(now / MINUTE) + minutes) * MINUTE

// Cron still wakes once per minute, but an idle source queries Notion only
// every two minutes. Pending pages and failed requests may resume next minute.
// Admission uses wall time as well as the event slot: delayed or duplicate
// deliveries cannot consume extra requests in the same minute.
export async function runScheduledSync(env: Env, kind: Kind, scheduledTime = Date.now()) {
  const now = Date.now()
  const slot = Math.floor(scheduledTime / MINUTE) * MINUTE
  if (!Number.isSafeInteger(slot) || slot > now) return "skipped" as const
  const token = crypto.randomUUID()
  const claimed = await env.CMS_DB.prepare(`INSERT INTO free_sync_runs
      (kind,last_slot,next_at,lease_token,lease_until,outcome) VALUES (?,?,?,?,?,'running')
    ON CONFLICT(kind) DO UPDATE SET last_slot=excluded.last_slot,next_at=excluded.next_at,
      lease_token=excluded.lease_token,lease_until=excluded.lease_until,outcome='running'
    WHERE free_sync_runs.last_slot<excluded.last_slot AND free_sync_runs.next_at<=?
      AND free_sync_runs.lease_until<=? RETURNING lease_token`)
    .bind(kind,slot,nextMinute(now,2),token,now+LEASE_MS,now,now).first()
  if (!claimed) return "skipped" as const

  let outcome: Outcome = "error"
  let nextAt = nextMinute(now,1)
  try {
    const state = await env.CMS_DB.prepare("SELECT watermark,cursor,started_at,checked_at FROM free_sync WHERE kind=?")
      .bind(kind).first<State>()
    if (!state) throw new Error("Missing CMS sync state")
    const started = state.started_at ?? now
    const batch = await notion<Batch>({...env,NOTION_WORKLOAD:"sync"},`data_sources/${source(env,kind)}/query`,{
      page_size:4,
      sorts:[{timestamp:"last_edited_time",direction:"ascending"}],
      filter:{timestamp:"last_edited_time",last_edited_time:{on_or_after:state.watermark}},
      ...(state.cursor ? {start_cursor:state.cursor} : {}),
    })
    if (!batch || !Array.isArray(batch.results) || batch.has_more && (!batch.next_cursor || batch.next_cursor===state.cursor)) {
      throw new Error("Invalid CMS page")
    }
    await storePages(env,batch.results,kind)
    // Rebuild even if a retry finds unchanged rows: a previous invocation may
    // have stored the rows but failed before updating the public document.
    if (batch.results.length) await rebuildDocuments(env,[kind])

    const finished = Date.now()
    const checkpoint = await env.CMS_DB.prepare(`UPDATE free_sync SET
        checked_at=MAX(checked_at,?),watermark=MAX(watermark,?),cursor=?,started_at=?
      WHERE kind=? AND watermark=? AND cursor IS ? AND started_at IS ? AND checked_at=?
        AND EXISTS(SELECT 1 FROM free_sync_runs WHERE kind=? AND lease_token=? AND lease_until>?)
      RETURNING kind`).bind(
        batch.has_more ? state.checked_at : started,
        batch.has_more ? state.watermark : new Date(started-2*MINUTE).toISOString(),
        batch.has_more ? batch.next_cursor : null,batch.has_more ? started : null,
        kind,state.watermark,state.cursor,state.started_at,state.checked_at,kind,token,finished,
      ).first()
    // A full reconciliation or a replacement lease may have advanced the
    // checkpoint meanwhile. Its state must never be overwritten by this run.
    outcome = !checkpoint ? "superseded" : batch.has_more ? "partial" : "complete"
    nextAt = nextMinute(finished,batch.has_more || started<finished-MINUTE ? 1 : 2)
    return outcome
  } catch (error) {
    if (!(error instanceof Busy)) throw error
    outcome = "paused"
    nextAt = Math.max(nextMinute(Date.now(),1),Date.now()+error.seconds*1000)
    return outcome
  } finally {
    // The token fences late completions after lease expiry. Pauses remain
    // visible in D1 without marking stale data as freshly checked.
    await env.CMS_DB.prepare(`UPDATE free_sync_runs SET next_at=?,lease_token=NULL,lease_until=0,
      outcome=?,completed_at=? WHERE kind=? AND lease_token=?`)
      .bind(Math.max(nextAt,nextMinute(Date.now(),1)),outcome,Date.now(),kind,token).run()
  }
}
