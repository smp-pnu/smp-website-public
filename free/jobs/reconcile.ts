import { normalizeId,type NotionPage } from "../../lib/content-model"
import { rebuildDocuments,removePage,storePages } from "../server/catalog"
import { notion,source } from "../server/notion"
import type { Env } from "../server/types"

// Normal quarter-hour runs only prepare queued assets. A daily full pass also
// recovers deletions/missed webhooks. Stalled incremental sync can request an
// earlier recovery; incomplete passes never advance this checkpoint.
export async function reconcileIfDue(env:Env,now=Date.now()) {
  const state=await env.CMS_DB.prepare(`SELECT
    (SELECT until_at FROM free_controls WHERE name='reconcile-next') AS next,
    (SELECT MIN(checked_at) FROM free_sync) AS checked,
    (SELECT MIN(until_at) FROM free_controls WHERE name LIKE 'publish-at:%') AS due`).first<{next:number|null;checked:number|null;due:number|null}>()
  if(state?.next && state.next>now && state.checked && state.checked>now-300_000 && (!state.due || state.due>now)) return false
  await reconcile(env)
  await env.CMS_DB.prepare("INSERT INTO free_controls(name,until_at) VALUES ('reconcile-next',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at").bind(now+86_400_000).run()
  return true
}

export async function reconcile(env:Env) {
  // A completed full pass recovers missed webhooks, deleted pages, future-dated
  // publications and expired member photo links. Never prune a partial pass.
  const started=new Date().toISOString()
  for(const kind of ["research","notice","members"] as const) {
    const ids:string[]=[],cursors=new Set<string>();let cursor:string|null=null
    do {
      const batch:{results:NotionPage[];has_more:boolean;next_cursor:string|null}|null=await notion(env,`data_sources/${source(env,kind)}/query`,{page_size:100,...(cursor?{start_cursor:cursor}:{})})
      if(!batch) throw new Error("CMS source unavailable")
      ids.push(...batch.results.flatMap(page=>{const id=normalizeId(page.id);return id?[id]:[]}))
      if(ids.length>2000) throw new Error("CMS source exceeds the reviewed 2000-page limit")
      await storePages(env,batch.results,kind)
      cursor=batch.has_more?batch.next_cursor:null
      if(batch.has_more && (!cursor || cursors.has(cursor))) throw new Error("Repeated CMS cursor")
      if(cursor)cursors.add(cursor)
    } while(cursor)
    const missing=await env.CMS_DB.prepare("SELECT id FROM free_content WHERE kind=? AND revision<=? AND id NOT IN(SELECT value FROM json_each(?))").bind(kind,started,JSON.stringify(ids)).all<{id:string}>()
    for(const {id} of missing.results) await removePage(env,id,started)
    await env.CMS_DB.prepare("UPDATE free_sync SET checked_at=?,watermark=?,cursor=NULL,started_at=NULL WHERE kind=?").bind(Date.now(),started,kind).run()
  }
  await rebuildDocuments(env)
  await env.CMS_DB.prepare("DELETE FROM free_controls WHERE name LIKE 'publish-at:%' AND until_at<=?").bind(Date.parse(started)).run()
}
