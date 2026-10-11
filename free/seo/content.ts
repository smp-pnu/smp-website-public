import { contentHref, fileUrl, plainText, safeUrl, sortContent, type ContentItem, type ContentKind, type RichText } from "../../lib/content-model"
import { blockValue, type ContentBlock } from "../../lib/notion-model"
import { getPdfSources, isTrustedAttachmentUrl } from "../../lib/pdf-source"
import { selectContentPage } from "../../lib/content-query"
import { contentListHref } from "../../lib/content-navigation"
import { escapeHtml as e, staticPages, siteOrigin } from "./metadata"

// A small, escaped HTML view for first responses. The same published data is
// handed to React, and no user-agent-specific version is ever served.
function richTextHtml(parts:RichText[] = []) {
  return parts.map(part=>{
    let text=e(part.plain_text??part.text?.content??"")
    for(const [flag,tag] of [["code","code"],["bold","strong"],["italic","em"],["strikethrough","s"],["underline","u"]] as const) {
      if(part.annotations?.[flag]) text=`<${tag}>${text}</${tag}>`
    }
    const url=safeUrl(part.href??part.text?.link?.url)
    return url?`<a href="${e(url)}" rel="noopener noreferrer">${text}</a>`:text
  }).join("")
}
export function blockHtml(blocks:ContentBlock[],depth=0):string {
  if(depth>8) return ""
  return blocks.map(block=>{
    const v=blockValue(block),text=richTextHtml(v.rich_text),nested=blockHtml(block.children??[],depth+1)
    const paragraph=(tag:string)=>`<${tag}>${text}</${tag}>${nested}`
    switch(block.type) {
      case "heading_1":return paragraph("h2")
      case "heading_2":return paragraph("h3")
      case "heading_3":return paragraph("h4")
      case "quote":return paragraph("blockquote")
      case "code":return `<pre><code>${e(plainText(v.rich_text))}</code></pre>${nested}`
      case "callout":return paragraph("aside")
      case "to_do":return `<p>${v.checked?"☑":"☐"} ${text}</p>${nested}`
      case "bulleted_list_item":return `<ul><li>${text}${nested}</li></ul>`
      case "numbered_list_item":return `<ol><li>${text}${nested}</li></ol>`
      case "toggle":return `<details><summary>${text}</summary>${nested}</details>`
      case "image":{ const url=fileUrl(v);return url?`<figure><img src="${e(url)}" alt="${e(plainText(v.caption)||"본문 이미지")}" loading="lazy" width="1200" height="800" style="width:100%;height:auto"><figcaption>${e(plainText(v.caption))}</figcaption></figure>`:"" }
      case "file":case "pdf":case "video":case "audio":case "bookmark":case "link_preview":case "embed":{
        const url=fileUrl(v)||safeUrl(v.url);return url?`<p><a href="${e(url)}" rel="noopener noreferrer">${e(plainText(v.caption)||v.name||"첨부 자료 열기")}</a></p>`:""
      }
      case "table":return `<table><tbody>${(block.children??[]).map((row,i)=>`<tr>${(blockValue(row).cells??[]).map((cell,j)=>{const tag=(v.has_column_header&&i===0)||(v.has_row_header&&j===0)?"th":"td";return `<${tag}>${richTextHtml(cell)}</${tag}>`}).join("")}</tr>`).join("")}</tbody></table>`
      case "column":case "column_list":return nested
      case "divider":return "<hr>"
      case "table_of_contents":return ""
      default:return paragraph("p")
    }
  }).join("")
}
function attachmentsHtml(item:ContentItem) {
  const pdfs=getPdfSources(item)
  const links=pdfs.map(pdf=>`<li><a href="/api/content/${item.kind}/${item.id}/pdf?${e(pdf.query)}&amp;download=1">${e(pdf.name)} · PDF 다운로드</a></li>`)
  item.attachments.forEach((file,index)=>{
    if(pdfs.some(pdf=>pdf.query===`index=${index}`)) return
    const url=isTrustedAttachmentUrl(file.url)?`/api/content/${item.kind}/${item.id}/file?index=${index}`:safeUrl(file.url)
    if(url) links.push(`<li><a href="${e(url)}" rel="noopener noreferrer">${e(file.name)}</a></li>`)
  })
  const external=safeUrl(item.externalUrl)
  if(external&&!pdfs.some(pdf=>pdf.query==="source=external")) links.push(`<li><a href="${e(external)}" rel="noopener noreferrer">관련 링크 열기</a></li>`)
  return links.length?`<section aria-label="첨부 자료"><h2>첨부 자료</h2><ul>${links.join("")}</ul></section>`:""
}
export function detailHtml(item:ContentItem,blocks:ContentBlock[],pending=false) {
  return `<main class="site-page max-w-4xl ${item.kind==="notice"?"notice-content":""}"><a href="/${item.kind}" class="text-site-accent">← ${item.kind.toUpperCase()}</a><article class="mt-10"><header class="border-b border-site-line pb-8"><p class="text-site-accent">${e(item.category)}</p><h1 class="mt-4 text-3xl leading-snug text-white">${e(item.title)}</h1><p class="mt-5 text-site-body"><time datetime="${e(item.date)}">${e(item.date)}</time> · ${e(item.author)}</p>${item.company||item.ticker||item.industry?`<p class="mt-4 text-site-body">${e([item.company,item.ticker,item.industry].filter(Boolean).join(" · "))}</p>`:""}<p class="mt-6 text-site-body">${e(item.summary)}</p></header><div class="seo-prose py-8">${pending?"<p>본문을 준비하고 있습니다.</p>":blockHtml(blocks)}${attachmentsHtml(item)}</div></article><p><a href="/${item.kind}" class="text-site-accent">목록으로 돌아가기</a></p></main>`
}
export function listHtml(kind:ContentKind,items:ContentItem[],search:URLSearchParams) {
  const result=selectContentPage(sortContent(items),kind,Object.fromEntries(search))
  const body=`<main class="site-page max-w-6xl"><h1 class="text-4xl text-white">${e(staticPages[`/${kind}`].title)}</h1><p class="mt-6 text-site-body">${e(staticPages[`/${kind}`].description)}</p><ol class="mt-10 divide-y divide-site-line">${result.visibleItems.map(item=>`<li class="py-6"><a class="text-xl text-white" href="${e(contentHref(item))}">${e(item.title)}</a><p class="mt-2 text-site-muted">${e(item.date)} · ${e(item.author)} · ${e(item.category)}</p><p class="mt-3 text-site-body">${e(item.summary)}</p></li>`).join("")}</ol><nav class="mt-10 flex flex-wrap gap-4" aria-label="페이지 이동">${Array.from({length:result.totalPages},(_,i)=>`<a href="${e(contentListHref(kind,{...result.listSearch,page:String(i+1)}))}" ${result.page===i+1?'aria-current="page"':""}>${i+1}</a>`).join("")}</nav></main>`
  return {body,page:result.page,totalPages:result.totalPages}
}
export function sitemapXml(items:ContentItem[]) {
  const entries=[...Object.entries(staticPages).filter(([path,page])=>!page.noindex&&path!=="/alumni").map(([path])=>({path})),...items.map(item=>({path:contentHref(item),modified:item.editedAt}))]
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry=>`<url><loc>${e(siteOrigin+entry.path)}</loc>${"modified" in entry&&typeof entry.modified==="string"&&Number.isFinite(Date.parse(entry.modified))?`<lastmod>${e(entry.modified)}</lastmod>`:""}</url>`).join("")}</urlset>`
}
