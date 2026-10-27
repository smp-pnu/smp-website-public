import { normalizeId, type ContentItem, type ContentKind } from "../../lib/content-model"
import { singleFlight } from "../../lib/single-flight"
import { published, source } from "./notion"
import type { Env } from "./types"

export const PUBLICATION_CHECK_TTL = 60_000
const checks = new WeakMap<Env["CMS_DB"],ReturnType<typeof singleFlight<ContentItem|null>>>()

// Reuse a successful check briefly across HTML, PDF ranges and visitors. The
// current catalog revision remains part of every lookup, so a processed
// unpublish/delete/update invalidates the check immediately. No stale fallback.
// Publisher completion deliberately continues using fresh published().
export async function visitorPublication(env:Env,kind:ContentKind,rawId:string) {
  const id=normalizeId(rawId)
  if(!id) return null
  if (kind === "research" && env.REPORT_PREVIEW) {
    const preview = await env.REPORT_PREVIEW.published(id)
    if (preview !== undefined) return preview
  }
  const owner=source(env,kind)
  let flight=checks.get(env.CMS_DB)
  if(!flight) {flight=singleFlight<ContentItem|null>();checks.set(env.CMS_DB,flight)}
  return flight(`${kind}:${owner}:${id}`,async()=>{
    const started=Date.now()
    const hit=await env.CMS_DB.prepare(`SELECT p.item FROM free_publication_checks p
      JOIN free_content c ON c.id=p.id AND c.kind=p.kind AND c.revision=p.revision
      WHERE p.id=? AND p.kind=? AND p.owner=? AND p.checked_at>? AND p.checked_at<=?`)
      .bind(id,kind,owner,started-PUBLICATION_CHECK_TTL,started).first<{item:string}>()
    if(hit) return JSON.parse(hit.item) as ContentItem
    const item=await published(env,kind,id)
    if(!item) {
      await env.CMS_DB.prepare("DELETE FROM free_publication_checks WHERE id=?").bind(id).run()
      return null
    }
    // Do not extend freshness by request duration or save a response after a
    // newer webhook/source revision has arrived while Notion was in flight.
    if(Date.now()-started<PUBLICATION_CHECK_TTL) await env.CMS_DB.prepare(`INSERT INTO free_publication_checks(id,kind,owner,revision,item,checked_at)
      SELECT id,kind,?,revision,?,? FROM free_content WHERE id=? AND kind=? AND revision=?
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,owner=excluded.owner,
        revision=excluded.revision,item=excluded.item,checked_at=excluded.checked_at
      WHERE free_publication_checks.checked_at<=excluded.checked_at`)
      .bind(owner,JSON.stringify(item),started,id,kind,item.editedAt??"").run()
    return item
  })
}
