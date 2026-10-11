import type { ContentItem } from "../../lib/content-model"
import type { ContentBlock } from "../../lib/notion-model"
import { rssXml } from "../seo/feeds"
import type { Env } from "./types"

export async function publicFeed(env:Env) {
  // Same publication-freshness window as the public catalogue. Never fetch
  // Notion for a feed request, expose members, or reuse an old body revision.
  const state=await env.CMS_DB.prepare("SELECT MIN(checked_at) AS checked_at,COUNT(*) AS sources FROM free_sync WHERE kind IN ('research','notice')").first<{checked_at:number;sources:number}>()
  if(!state||state.sources!==2||env.SMP_FIXTURE!=="1"&&Date.now()-state.checked_at>300_000) return new Response("Feed temporarily unavailable",{status:503,headers:{"Retry-After":"60"}})
  const rows=await env.CMS_DB.prepare(`WITH latest AS (
    SELECT item,blocks,id FROM free_content
    WHERE kind IN ('research','notice') AND body_revision=revision AND blocks IS NOT NULL
      AND length(CAST(blocks AS BLOB))<=100000 AND length(CAST(item AS BLOB))<=20000
    ORDER BY json_extract(item,'$.date') DESC,id DESC LIMIT 10
  ) SELECT item,blocks FROM (
    SELECT item,blocks,id,SUM(length(CAST(blocks AS BLOB))+length(CAST(item AS BLOB)))
      OVER (ORDER BY json_extract(item,'$.date') DESC,id DESC) AS bytes FROM latest
  ) WHERE bytes<=160000 ORDER BY json_extract(item,'$.date') DESC,id DESC`).all<{item:string;blocks:string}>()
  return new Response(rssXml(rows.results.map(row=>({item:JSON.parse(row.item) as ContentItem,blocks:JSON.parse(row.blocks) as ContentBlock[]}))),{headers:{"Content-Type":"application/rss+xml; charset=utf-8","Cache-Control":"private, no-store"}})
}
