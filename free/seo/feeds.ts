import { contentHref, type ContentItem } from "../../lib/content-model"
import type { ContentBlock } from "../../lib/notion-model"
import { RESEARCH_CONTEXT, SITE_NAME_KO } from "../../lib/site-config"
import { blockHtml } from "./content"
import { escapeHtml, siteOrigin } from "./metadata"

// XML 1.0 forbids control characters, including when entity-escaped.
const xml=(value:unknown)=>escapeHtml(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,"")
export function sitemapIndexXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["pages","research","notice"].map(kind=>`<sitemap><loc>${siteOrigin}/sitemap-${kind}.xml</loc></sitemap>`).join("")}</sitemapindex>`
}
export type FeedEntry={item:ContentItem;blocks:ContentBlock[]}
export function rssXml(entries:FeedEntry[]) {
  const items=entries.map(({item,blocks})=>{
    const url=siteOrigin+contentHref(item),date=Date.parse(item.date)
    const facts=[item.company,item.ticker,item.industry,item.author].filter(Boolean).join(" · ")
    const points=item.investmentPoints?.length?`<h2>투자 포인트</h2><ul>${item.investmentPoints.map(point=>`<li>${escapeHtml(point)}</li>`).join("")}</ul>`:""
    // The prepared body contains safe links. RSS readers need absolute URLs.
    const body=`<p>${escapeHtml(facts)}</p><p>${escapeHtml(item.summary)}</p>${item.kind==="research"?`<p>${escapeHtml(RESEARCH_CONTEXT)}</p>`:""}${points}${blockHtml(blocks)}<p><a href="${url}">원문·첨부 자료 보기</a></p>`
      .replace(/(href|src)="(\/[^\"]*)"/g,(_match,attr,path)=>`${attr}="${siteOrigin}${path}"`)
    return `<item><title>${xml(item.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid>${Number.isFinite(date)?`<pubDate>${new Date(date).toUTCString()}</pubDate>`:""}<category>${xml(item.category||item.kind)}</category><description>${xml(body)}</description></item>`
  }).join("")
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(SITE_NAME_KO)} · 최신 글</title><link>${siteOrigin}/</link><description>SMP의 최신 공개 리포트와 공지사항</description><language>ko-KR</language><atom:link href="${siteOrigin}/feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`
}
