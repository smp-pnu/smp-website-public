import { contentHref, normalizeId, toContentItem, type ContentKind, type NotionPage } from "../../lib/content-model"
import { memberSearchEntries, toMember } from "../../lib/member-model"
import { industrySector } from "../../lib/wics"
import { notion, source } from "./notion"
import type { Env } from "./types"
import { staticEntries } from "../../lib/site-search-static"
export function searchEntry(item: NonNullable<ReturnType<typeof toContentItem>>) {
  return { title: item.title, text: [item.category,item.summary,item.author,item.company,item.ticker,item.industry,industrySector(item.industry)].filter(Boolean).join(" · "), href:contentHref(item),label:item.kind==="research"?"리포트":"공지" }
}
export async function rebuildDocuments(env: Env) {
  // Aggregate on D1, without decoding the full catalogue in the Worker.
  await env.CMS_DB.batch([
    ...["research","notice","members"].map(kind=>env.CMS_DB.prepare(`INSERT INTO free_documents(name,body,version)
      SELECT ?, '{"state":"ready","items":'||json_group_array(json(CASE WHEN cover IS NULL THEN compact ELSE json_set(compact,'$.cover',json_object('url',json_extract(cover,'$.url'))) END))||'}', ? FROM (SELECT json_set(json_remove(item,'$.editedAt','$.investmentPoints'),'$.summary',substr(COALESCE(json_extract(item,'$.summary'),''),1,320),'$.externalUrl',NULL,'$.attachments',json(COALESCE((SELECT json_group_array(json_object('name',value->>'$.name','url','')) FROM json_each(item,'$.attachments')),'[]'))) AS compact,cover FROM free_content WHERE kind=?) WHERE true
      ON CONFLICT(name) DO UPDATE SET body=excluded.body,version=free_documents.version+1 WHERE free_documents.body<>excluded.body`).bind(kind,Date.now(),kind)),
    env.CMS_DB.prepare(`INSERT INTO free_documents(name,body,version) SELECT 'search','{"partial":false,"entries":'||json_group_array(json(entry))||'}', ? FROM
      (SELECT search_entry AS entry FROM free_content UNION ALL SELECT value FROM json_each(?)) WHERE true
      ON CONFLICT(name) DO UPDATE SET body=excluded.body,version=free_documents.version+1 WHERE free_documents.body<>excluded.body`).bind(Date.now(),JSON.stringify(staticEntries.map(item=>({...item,label:item.href.startsWith('/achievements#')?'수상':'페이지'})))),
  ])
}
export async function enqueue(env: Env,id: string,revision: string) {
  await env.CMS_DB.prepare(`INSERT INTO free_jobs(id,revision,next_at) VALUES (?,?,?)
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,attempts=0,next_at=excluded.next_at
    WHERE revision < excluded.revision`).bind(id,revision,Date.now()).run()
}
export async function storePages(env:Env,pages:NotionPage[],kind:ContentKind|"members") {
  const owner=source(env,kind)
  const rows=pages.flatMap(page=>{
    const id=normalizeId(page.id)
    if(!id || page.parent?.type!=="data_source_id" || normalizeId(page.parent.data_source_id??"")!==owner) return []
    const item=kind==="members"?toMember(page,owner):toContentItem(page,kind)
    const revision=page.last_edited_time??page.created_time
    const entry=!item?null:kind==="members"?memberSearchEntries([item as ReturnType<typeof toMember>&{}])[0]:searchEntry(item as ReturnType<typeof toContentItem>&{})
    return [{id,kind,revision,item,entry}]
  })
  if(!rows.length) return false
  const data=JSON.stringify(rows)
  // One transaction prevents old overlapping events from resurrecting a page.
  // At most six statements per batch, independent of the number of rows.
  await env.CMS_DB.batch([
    env.CMS_DB.prepare(`INSERT INTO free_content(id,kind,revision,item,search_entry)
      SELECT value->>'$.id',value->>'$.kind',value->>'$.revision',value->'$.item',value->'$.entry' FROM json_each(?)
      WHERE value->>'$.item' IS NOT NULL AND value->>'$.revision'>=COALESCE((SELECT revision FROM free_tombstones WHERE id=value->>'$.id'),'')
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,item=excluded.item,search_entry=excluded.search_entry
      WHERE free_content.revision < excluded.revision`).bind(data),
    env.CMS_DB.prepare(`DELETE FROM free_content WHERE id IN(SELECT value->>'$.id' FROM json_each(?) WHERE value->>'$.item' IS NULL AND value->>'$.revision'>=free_content.revision)`).bind(data),
    env.CMS_DB.prepare(`INSERT INTO free_jobs(id,revision,next_at) SELECT id,revision,? FROM free_content
      WHERE kind!='members' AND (body_revision IS NULL OR body_revision!=revision) AND id IN(SELECT value->>'$.id' FROM json_each(?))
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,attempts=0,next_at=excluded.next_at WHERE free_jobs.revision<excluded.revision`).bind(Date.now(),data),
    env.CMS_DB.prepare(`DELETE FROM free_jobs WHERE id IN(SELECT value->>'$.id' FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM free_content WHERE free_content.id=free_jobs.id)`).bind(data),
    env.CMS_DB.prepare(`INSERT INTO free_tombstones(id,revision) SELECT value->>'$.id',value->>'$.revision' FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision WHERE revision<excluded.revision`).bind(data),
  ])
  return true
}
export async function storePage(env:Env,page:NotionPage,kind:ContentKind|"members") { return storePages(env,[page],kind) }
export async function removePage(env:Env,id:string,revision=new Date().toISOString()) {
  await env.CMS_DB.batch([
    env.CMS_DB.prepare("DELETE FROM free_content WHERE id=? AND revision<=?").bind(id,revision),
    env.CMS_DB.prepare("DELETE FROM free_jobs WHERE id=? AND NOT EXISTS(SELECT 1 FROM free_content WHERE id=?)").bind(id,id),
    env.CMS_DB.prepare("DELETE FROM free_media WHERE page_id=? AND NOT EXISTS(SELECT 1 FROM free_content WHERE id=?)").bind(id,id),
    env.CMS_DB.prepare("INSERT INTO free_tombstones(id,revision) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision)").bind(id,revision),
  ])
}
export async function syncKind(env:Env,kind:ContentKind|"members") {
  const state=await env.CMS_DB.prepare("SELECT watermark,cursor,started_at FROM free_sync WHERE kind=?").bind(kind).first<{watermark:string;cursor:string|null;started_at:number|null}>()
  const started=state?.started_at??Date.now()
  const batch=await notion<{results:NotionPage[];has_more:boolean;next_cursor:string|null}>(env,`data_sources/${source(env,kind)}/query`,{
    page_size:4,sorts:[{timestamp:"last_edited_time",direction:"ascending"}],filter:{timestamp:"last_edited_time",last_edited_time:{on_or_after:state?.watermark??"1970-01-01T00:00:00.000Z"}},...(state?.cursor?{start_cursor:state.cursor}:{}),
  })
  if(!batch || batch.has_more && (!batch.next_cursor || batch.next_cursor===state?.cursor)) throw new Error("Invalid CMS page")
  const changed=await storePages(env,batch.results,kind)
  if(batch.has_more) await env.CMS_DB.prepare("UPDATE free_sync SET cursor=?,started_at=? WHERE kind=?").bind(batch.next_cursor,started,kind).run()
  else await env.CMS_DB.prepare("UPDATE free_sync SET checked_at=?,watermark=?,cursor=NULL,started_at=NULL WHERE kind=?").bind(Date.now(),new Date(started-120_000).toISOString(),kind).run()
  return changed
}
