import type { Env } from "./types"
// Compatibility for an older open tab. New catalogues link to prepared static
// images directly, so browsing member photos spends no Worker/Notion quota.
export async function memberPhoto(env:Env,id:string) {
  const row=await env.CMS_DB.prepare(`SELECT json_extract(cover,'$.url') AS url FROM free_content
    WHERE id=? AND kind='members' AND body_revision=revision
    AND json_extract(item,'$.image')='/api/member-photo/'||id
    AND (SELECT checked_at FROM free_sync WHERE kind='members')>?`).bind(id,Date.now()-300_000).first<{url:string|null}>()
  if(!row?.url || !new RegExp(`^/report-covers/${id}/[a-f0-9]{64}\\.webp$`).test(row.url)) return new Response("Not found",{status:404})
  return new Response(null,{status:307,headers:{Location:row.url,"Cache-Control":"private, no-store"}})
}
