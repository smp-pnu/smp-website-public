import { contentHref, fileUrl, plainText, safeUrl, sortContent, type ContentItem, type ContentKind, type RichText } from "../../lib/content-model"
import { blockValue, type ContentBlock } from "../../lib/notion-model"
import { getPdfSources, isTrustedAttachmentUrl } from "../../lib/pdf-source"
import { selectContentPage } from "../../lib/content-query"
import { contentListHref } from "../../lib/content-navigation"
import { escapeHtml as e, staticPages, siteOrigin } from "./metadata"
import { publicCover, type CoveredItem } from "../../lib/public-cover"
import type { RelatedReports } from "../../lib/related-reports"
import { publicReportAuthor } from "../../lib/research-metadata"
import { RESEARCH_CONTEXT } from "../../lib/site-config"
import { AI_SUMMARY_NOTE, summarySections, type PublicReportAiSummary } from "../../lib/report-ai-summary"

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
      case "paragraph":return `<p class="${!plainText(v.rich_text).trim()&&!nested?"notion-paragraph--empty":""}">${text}</p>${nested}`
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
function coverHtml(item:CoveredItem,thumbnail=false) {
  const cover=publicCover(item)
  if(!cover)return ""
  const source=thumbnail?cover.url:cover.previewUrl
  const size=cover.width&&cover.height?` width="${cover.width}" height="${cover.height}"`:""
  return `<img src="${e(source)}" alt="${e(item.title)} 리포트 표지"${size} loading="${thumbnail?"lazy":"eager"}" decoding="async" style="${thumbnail?"width:96px;float:left;margin-right:20px;":"width:100%;max-width:720px;margin:24px auto;display:block;"}height:auto">`
}
function relatedHtml(related:RelatedReports) {
  return related?`<aside aria-label="관련 리포트" class="mt-12 border-t border-site-line pt-7"><h2 class="text-sm text-site-body">${e(related.label)}</h2><ul class="mt-4 divide-y divide-site-line-soft">${related.items.map(item=>`<li><a class="block py-4 text-site-body" href="${e(contentHref(item))}">${e(item.title)} <time class="text-xs text-site-muted" datetime="${e(item.date)}">${e(item.date)}</time></a></li>`).join("")}</ul></aside>`:""
}
export function aiSummaryHtml(summary:PublicReportAiSummary|null) {
  if(!summary)return ""
  return `<section aria-label="AI 리포트 요약" class="report-ai-summary"><header class="report-ai-summary__header"><div><p class="report-ai-summary__eyebrow">REPORT INSIGHTS</p><h2>AI 리포트 요약</h2></div><span class="report-ai-summary__badge">시범 제공</span></header><p class="report-ai-summary__date">게시일 ${e(summary.reportDate)} · PDF ${summary.documentPages}쪽의 텍스트 기준</p><div class="report-ai-summary__sections">${summarySections(summary).map(section=>`<section><h3>${section.title}</h3>${section.claims.length?`<ul>${section.claims.map(claim=>`<li><span>${e(claim.text)}</span><span class="report-ai-summary__sources">${claim.pages.map(page=>`<span>${page}쪽</span>`).join(" ")}</span></li>`).join("")}</ul>`:`<p class="report-ai-summary__empty">원문에서 별도로 명시한 위험 요인을 확인하지 못했습니다.</p>`}</section>`).join("")}</div><p class="report-ai-summary__note">${AI_SUMMARY_NOTE}</p></section>`
}
export function detailHtml(item:CoveredItem,blocks:ContentBlock[],pending=false,related:RelatedReports=null,aiSummary:PublicReportAiSummary|null=null) {
  const points=item.kind==="research"&&item.investmentPoints?.length?`<details><summary>투자 포인트</summary><ul>${item.investmentPoints.map(point=>`<li>${e(point)}</li>`).join("")}</ul></details>`:""
  return `<main class="site-page max-w-4xl ${item.kind==="notice"?"notice-content notice-detail":""}"><a href="/${item.kind}" class="text-site-accent">← ${item.kind.toUpperCase()}</a><article class="${item.kind==="notice"?"notice-article mt-8":"mt-10"}"><header class="${item.kind==="notice"?"notice-article-header":"border-b border-site-line pb-8"}"><p class="text-site-accent">${e(item.category)}</p><h1 class="${item.kind==="notice"?"notice-article-title":"mt-4 text-3xl leading-snug text-white"}">${e(item.title)}</h1><p class="${item.kind==="notice"?"notice-article-meta":"mt-5 text-site-body"}"><time datetime="${e(item.date)}">${e(item.date)}</time> · ${e(item.kind==="research"?publicReportAuthor(item.author):item.author)}</p>${item.company||item.ticker||item.industry?`<p class="mt-4 text-site-body">${e([item.company,item.ticker,item.industry].filter(Boolean).join(" · "))}</p>`:""}<p class="${item.kind==="notice"?"notice-article-summary":"mt-6 text-site-body"}">${e(item.summary)}</p>${item.kind==="research"?`<p class="mt-5 text-xs leading-6 text-site-muted">${e(RESEARCH_CONTEXT)}</p>`:""}${points}</header>${coverHtml(item)}${!pending&&item.kind==="research"?aiSummaryHtml(aiSummary):""}<div class="seo-prose py-8">${pending?"<p>본문을 준비하고 있습니다.</p>":blockHtml(blocks)}${attachmentsHtml(item)}</div>${relatedHtml(related)}</article><p><a href="/${item.kind}" class="text-site-accent">목록으로 돌아가기</a></p></main>`
}
export function listHtml(kind:ContentKind,items:ContentItem[],search:URLSearchParams) {
  const result=selectContentPage(sortContent(items),kind,Object.fromEntries(search))
  if(kind==="notice") {
    const rows=result.visibleItems.map(item=>`<li><a class="notice-entry" href="${e(contentHref(item))}"><div class="notice-entry__meta"><time class="text-sm text-site-muted" datetime="${e(item.date)}">${e(item.date)}</time><span class="text-xs text-site-accent">${e(item.pinned?"주요 공지":item.category)}</span></div><div><p class="text-xs text-site-muted">${e([item.pinned?item.category:"",item.author].filter(Boolean).join(" · "))}</p><h2 class="mt-2 text-lg font-medium leading-relaxed text-white sm:text-[22px]">${e(item.title)}</h2><p class="mt-3 text-sm leading-7 text-site-body">${e(item.summary)}</p></div><span class="text-site-accent" aria-hidden="true">↗</span></a></li>`).join("")
    const pages=Array.from({length:result.totalPages},(_,i)=>`<a href="${e(contentListHref(kind,{...result.listSearch,page:String(i+1)}))}" ${result.page===i+1?'aria-current="page"':""}>${i+1}</a>`).join("")
    return {body:`<main class="notice-content site-page min-h-[75svh] max-w-6xl"><header class="page-intro"><p class="page-intro__eyebrow">NEWS &amp; UPDATES</p><h1 class="page-intro__title">NOTICE</h1><p class="page-intro__description">SMP의 새로운 소식과 함께 알아둘 이야기.</p></header><p class="mt-12 mb-7 text-site-body">전체 공지 · ${result.total}건</p><ul class="notice-index">${rows}</ul>${result.totalPages>1?`<nav class="mt-10 flex flex-wrap gap-4" aria-label="페이지 이동">${pages}</nav>`:""}</main>`,page:result.page,totalPages:result.totalPages}
  }
  const body=`<main class="site-page max-w-6xl"><h1 class="text-4xl text-white">${e(staticPages[`/${kind}`].title)}</h1><p class="mt-6 text-site-body">${e(staticPages[`/${kind}`].description)}</p><ol class="mt-10 divide-y divide-site-line">${result.visibleItems.map(item=>`<li class="flow-root py-6">${coverHtml(item,true)}<a class="text-xl text-white" href="${e(contentHref(item))}">${e(item.title)}</a><p class="mt-2 text-site-muted">${e(item.date)} · ${e(item.kind==="research"?publicReportAuthor(item.author):item.author)} · ${e(item.category)}</p><p class="mt-3 text-site-body">${e(item.summary)}</p></li>`).join("")}</ol><nav class="mt-10 flex flex-wrap gap-4" aria-label="페이지 이동">${Array.from({length:result.totalPages},(_,i)=>`<a href="${e(contentListHref(kind,{...result.listSearch,page:String(i+1)}))}" ${result.page===i+1?'aria-current="page"':""}>${i+1}</a>`).join("")}</nav></main>`
  return {body,page:result.page,totalPages:result.totalPages}
}
export function sitemapXml(items:CoveredItem[],includeStatic=true) {
  const entries=[...(includeStatic?Object.entries(staticPages).filter(([path,page])=>!page.noindex&&path!=="/alumni").map(([path])=>({path,modified:undefined as string|undefined,image:undefined as string|undefined})):[]),...items.map(item=>({path:contentHref(item),modified:item.editedAt,image:publicCover(item)?.previewUrl}))]
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.map(entry=>`<url><loc>${e(siteOrigin+entry.path)}</loc>${typeof entry.modified==="string"&&Number.isFinite(Date.parse(entry.modified))?`<lastmod>${e(entry.modified)}</lastmod>`:""}${entry.image?`<image:image><image:loc>${e(siteOrigin+entry.image)}</image:loc></image:image>`:""}</url>`).join("")}</urlset>`
}
