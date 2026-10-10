import { contentHref, normalizeId, toContentItem, type ContentKind, type NotionPage } from "../../lib/content-model"
import { memberSearchEntries, toMember } from "../../lib/member-model"
import { industrySector } from "../../lib/wics"
import { notion, source } from "./notion"
import type { Env } from "./types"
import { staticEntries } from "../../lib/site-search-static"
import { isNotionFileUrl } from "../../lib/pdf-source"
type Kind = ContentKind | "members"
// D1 and the local SQLite test adapter expose changes in different envelopes.
function changes(result: unknown) {
  const value = result as { meta?: { changes?: number }; changes?: number | bigint }
  return Number(value?.meta?.changes ?? value?.changes ?? 0)
}
export function searchEntry(item: NonNullable<ReturnType<typeof toContentItem>>) {
  return { title: item.title, text: [item.category,item.summary,item.author,item.company,item.ticker,item.industry,industrySector(item.industry)].filter(Boolean).join(" · "), href:contentHref(item),label:item.kind==="research"?"리포트":"공지" }
}
export async function rebuildDocuments(env: Env, kinds: readonly Kind[] = ["research","notice","members"]) {
  // Aggregate on D1, without decoding the full catalogue in the Worker.
  await env.CMS_DB.batch([
    ...kinds.map(kind=>kind==="members" ? env.CMS_DB.prepare(`INSERT INTO free_documents(name,body,version)
      SELECT 'members','{"state":"ready","items":'||json_group_array(json(CASE
        WHEN json_extract(item,'$.image')='/api/member-photo/'||id THEN
          CASE WHEN body_revision=revision AND cover IS NOT NULL THEN json_set(item,'$.image',json_extract(cover,'$.url')) ELSE json_remove(item,'$.image') END
        ELSE item END))||'}',? FROM free_content WHERE kind='members'
      ON CONFLICT(name) DO UPDATE SET body=excluded.body,version=free_documents.version+1 WHERE free_documents.body<>excluded.body`).bind(Date.now()) : env.CMS_DB.prepare(`INSERT INTO free_documents(name,body,version)
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
    const photo=kind==="members" && !!item && "image" in item && !!item.image && isNotionFileUrl(item.image)
    const date=kind!=="members" && !page.archived && !page.in_trash && page.properties["공개"]?.checkbox && page.properties["게시일"]?.date?.start
    const timestamp=date?Date.parse(date.length===10?`${date}T00:00:00+09:00`:date):NaN
    const due=timestamp>Date.now()?timestamp:null
    // Signed upload URLs never belong in a public catalogue. The publisher
    // reads the fresh page when preparing this photo as a static asset.
    return [{id,kind,revision,item:photo?{...item,image:`/api/member-photo/${id}`}:item,entry,photo,due}]
  })
  if(!rows.length) return false
  const data=JSON.stringify(rows)
  const withdrawn=JSON.stringify(rows.filter(row=>!row.item).map(({id,revision})=>({id,revision})))
  // One transaction prevents old overlapping events from resurrecting a page.
  // A fixed number of statements per batch, independent of the row count.
  const results=await env.CMS_DB.batch([
    env.CMS_DB.prepare(`INSERT INTO free_content(id,kind,revision,item,search_entry)
      SELECT value->>'$.id',value->>'$.kind',value->>'$.revision',value->'$.item',value->'$.entry' FROM json_each(?)
      WHERE value->>'$.item' IS NOT NULL AND value->>'$.revision'>=COALESCE((SELECT revision FROM free_tombstones WHERE id=value->>'$.id'),'')
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,item=excluded.item,search_entry=excluded.search_entry
      WHERE free_content.revision < excluded.revision OR (free_content.revision=excluded.revision AND excluded.kind='members'
        AND json_extract(excluded.item,'$.image')='/api/member-photo/'||excluded.id
        AND json_extract(free_content.item,'$.image')<>json_extract(excluded.item,'$.image'))`).bind(data),
    // Select candidate primary keys before comparing revisions. Correlating
    // the IN subquery with the outer revision scanned the entire catalogue
    // once per incoming row, even when every page remained public.
    env.CMS_DB.prepare(`DELETE FROM free_content
      WHERE id IN(SELECT value->>'$.id' FROM json_each(?))
      AND revision<=COALESCE((SELECT value->>'$.revision' FROM json_each(?) WHERE value->>'$.id'=free_content.id),'')`).bind(withdrawn,withdrawn),
    env.CMS_DB.prepare(`INSERT INTO free_jobs(id,revision,next_at) SELECT id,revision,? FROM free_content
      WHERE (kind!='members' OR id IN(SELECT value->>'$.id' FROM json_each(?) WHERE value->>'$.photo'=1)) AND (body_revision IS NULL OR body_revision!=revision) AND id IN(SELECT value->>'$.id' FROM json_each(?))
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,attempts=0,next_at=excluded.next_at WHERE free_jobs.revision<excluded.revision`).bind(Date.now(),data,data),
    env.CMS_DB.prepare(`DELETE FROM free_jobs WHERE id IN(SELECT value->>'$.id' FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM free_content WHERE free_content.id=free_jobs.id)`).bind(data),
    env.CMS_DB.prepare(`INSERT INTO free_tombstones(id,revision) SELECT value->>'$.id',value->>'$.revision' FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision WHERE revision<excluded.revision`).bind(data),
    env.CMS_DB.prepare(`INSERT INTO free_controls(name,until_at) SELECT 'publish-at:'||(value->>'$.id'),value->>'$.due' FROM json_each(?)
      WHERE value->>'$.due' IS NOT NULL AND value->>'$.revision'=(SELECT revision FROM free_tombstones WHERE id=value->>'$.id')
      ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<>excluded.until_at`).bind(data),
    env.CMS_DB.prepare(`DELETE FROM free_controls WHERE name IN(SELECT 'publish-at:'||(value->>'$.id') FROM json_each(?)
      WHERE value->>'$.due' IS NULL AND value->>'$.revision'=(SELECT revision FROM free_tombstones WHERE id=value->>'$.id'))`).bind(data),
  ])
  return changes(results[0])+changes(results[1])>0
}
export async function storePage(env:Env,page:NotionPage,kind:ContentKind|"members") { return storePages(env,[page],kind) }
export async function removePage(env:Env,id:string,revision=new Date().toISOString()) {
  const results=await env.CMS_DB.batch([
    env.CMS_DB.prepare("DELETE FROM free_content WHERE id=? AND revision<=?").bind(id,revision),
    env.CMS_DB.prepare("DELETE FROM free_jobs WHERE id=? AND NOT EXISTS(SELECT 1 FROM free_content WHERE id=?)").bind(id,id),
    env.CMS_DB.prepare("DELETE FROM free_media WHERE page_id=? AND NOT EXISTS(SELECT 1 FROM free_content WHERE id=?)").bind(id,id),
    env.CMS_DB.prepare("INSERT INTO free_tombstones(id,revision) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET revision=MAX(revision,excluded.revision)").bind(id,revision),
  ])
  return changes(results[0])>0
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
