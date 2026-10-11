import { normalizeId, type ContentItem, type ContentKind } from "../../lib/content-model"
import type { ContentBlock } from "../../lib/notion-model"
import { detailHtml, listHtml, sitemapXml } from "../seo/content"
import { injectPage, siteOrigin } from "../seo/metadata"
import { publicBudget } from "./budget"
import { enqueue } from "./catalog"
import { published } from "./notion"
import type { Context, Env } from "./types"

export async function readDetail(env:Env,ctx:Context,kind:ContentKind,id:string) {
  const item=await published(env,kind,id)
  if(!item) return null
  const record=await env.CMS_DB.prepare("SELECT blocks,body_revision,cover FROM free_content WHERE id=? AND kind=?").bind(id,kind).first<{blocks:string|null;body_revision:string|null;cover:string|null}>()
  const ready=!!record && record.body_revision===item.editedAt && !!record.blocks
  if(!ready && env.SMP_READ_ONLY!=="1") ctx.waitUntil(enqueue(env,id,item.editedAt??""))
  return {item:{...item,...(record?.cover?{cover:JSON.parse(record.cover)}:{})},blocks:ready?JSON.parse(record!.blocks!) as ContentBlock[]:[],bodyPending:!ready}
}
type ReadDocument=(kind:ContentKind)=>Promise<Response>
export async function publicPage(request:Request,env:Env,ctx:Context,readDocument:ReadDocument) {
  const url=new URL(request.url),match=/^\/(research|notice)(?:\/([a-f\d-]{32,36}))?\/?$/.exec(url.pathname)
  const sitemap=url.pathname==="/sitemap.xml"
  if(!match&&!sitemap) return env.ASSETS.fetch(request)
  const kind=match?.[1] as ContentKind,id=match?.[2]?normalizeId(match[2]):null
  if(match?.[2]&&!id) return new Response("Not found",{status:404,headers:{"X-Robots-Tag":"noindex"}})
  const denied=await publicBudget(request,env,id?{id,kind}:undefined)
  if(denied) return denied
  // Canonical redirects are limited to page requests; API and asset origins
  // continue working for the publishing runner and existing file links.
  const canonicalPath=match?`/${kind}${id?`/${id}`:""}`:url.pathname
  if(env.SMP_FIXTURE!=="1" && (url.hostname==="www.pnusmp.com"||url.pathname!==canonicalPath)) return Response.redirect(siteOrigin+canonicalPath+url.search,301)
  if(sitemap) {
    const responses=await Promise.all([readDocument("research"),readDocument("notice")])
    if(responses.some(r=>!r.ok)) return new Response("Catalogue temporarily unavailable",{status:503,headers:{"Retry-After":"60"}})
    const results=await Promise.all(responses.map(r=>r.json() as Promise<{items:ContentItem[]}>))
    return new Response(sitemapXml(results.flatMap(r=>r.items)),{headers:{"Content-Type":"application/xml; charset=utf-8"}})
  }
  let body:string,data:{path:string;value:unknown},item:ContentItem|undefined
  if(id) {
    const detail=await readDetail(env,ctx,kind,id)
    if(!detail) return new Response("게시글이 없거나 비공개 상태입니다.",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","X-Robots-Tag":"noindex"}})
    item=detail.item
    body=detailHtml(detail.item,detail.blocks,detail.bodyPending)
    data={path:`/api/detail/${kind}/${id}`,value:detail}
  } else {
    const response=await readDocument(kind)
    if(!response.ok) return response
    const value=await response.json() as {items:ContentItem[]}
    const result=listHtml(kind,value.items,url.searchParams)
    const requested=Number(url.searchParams.get("page")||1)
    if(requested>result.totalPages) return new Response("해당 페이지가 없습니다.",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","X-Robots-Tag":"noindex"}})
    body=result.body;data={path:`/api/catalog/${kind}`,value}
  }
  const shell=await env.ASSETS.fetch(new Request(new URL("/page-shell",url)))
  if(!shell.ok) throw new Error("Page shell unavailable")
  const headers=new Headers(shell.headers)
  headers.set("Content-Type","text/html; charset=utf-8")
  headers.set("Cache-Control","private, no-store")
  headers.delete("etag");headers.delete("content-length");headers.delete("last-modified")
  return new Response(injectPage(await shell.text(),canonicalPath+url.search,body,item,data),{headers})
}
