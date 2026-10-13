import type { ContentItem } from "../../lib/content-model"
import { publicCover, type CoveredItem } from "../../lib/public-cover"
import { SITE_ALTERNATE_NAMES, SITE_CHANNELS, SITE_DESCRIPTION, SITE_HOME_TITLE, SITE_INTRO, SITE_NAME_KO, SITE_ORIGIN, SITE_PAGE_METADATA, SITE_SHORT_NAME_KO } from "../../lib/site-config"

export const siteOrigin=SITE_ORIGIN
export const siteName=SITE_NAME_KO
export const staticPages:Record<string,{title:string;description:string;noindex?:boolean}>={
  "/":{title:SITE_HOME_TITLE,description:SITE_DESCRIPTION},
  "/about":SITE_PAGE_METADATA.about,
  "/curriculum":SITE_PAGE_METADATA.curriculum,
  "/achievements":{title:"활동 성과",description:"부산대학교 금융투자학회 SMP의 금융투자 대회 수상과 활동 성과입니다."},
  "/recruit":SITE_PAGE_METADATA.recruit,
  "/contact":{title:"문의",description:"부산대학교 금융투자학회 SMP의 공식 이메일, 네이버 카페와 인스타그램 안내입니다."},
  "/research":{title:"기업·산업 분석 리포트",description:"부산대학교 금융투자학회 SMP 학회원이 작성한 주식·기업분석 및 산업 리포트입니다. 기업명·종목코드·산업·발표 학기로 대학생 투자 리서치를 찾고 PDF 원문을 읽어보세요."},
  "/notice":{title:"공지사항",description:"부산대학교 금융투자학회 SMP의 행사, 모집, 운영 공지와 학회 소식입니다."},
  "/network":{title:"동문 네트워크",description:"부산대학교 금융투자학회 SMP의 기수별 동문 네트워크입니다."},
  "/alumni":{title:"동문 네트워크",description:"부산대학교 금융투자학회 SMP의 기수별 동문 네트워크입니다."},
  "/members":{title:"활동 학회원",description:"부산대학교 금융투자학회 SMP의 기수별 활동 학회원을 소개합니다."},
  "/search":{title:"통합 검색",description:"SMP의 리포트와 공지, 학회 정보를 검색합니다.",noindex:true},
}
export const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!))
export const scriptJson=(value:unknown)=>JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")
const organization={
  "@type":"Organization","@id":`${siteOrigin}/#organization`,name:siteName,
  alternateName:SITE_ALTERNATE_NAMES,url:siteOrigin,foundingDate:"2006",
  description:SITE_INTRO,
  logo:`${siteOrigin}/smp-search-icon-light.png`,email:SITE_CHANNELS.email,
  sameAs:[SITE_CHANNELS.cafe,SITE_CHANNELS.instagram,SITE_CHANNELS.youtube],
}
type SeoItem=CoveredItem
function articleTitle(item:SeoItem) {
  const company=item.company?.trim()
  // Keep the author's title intact; supply a company only when it is missing.
  const subject=item.kind==="research"&&company&&!item.title.includes(company)
    ?`${company}${item.ticker?` (${item.ticker})`:""} 기업분석 · ${item.title}`:item.title
  return `${subject} | ${SITE_SHORT_NAME_KO}`
}
export function pageMetadata(path:string,item?:SeoItem) {
  const url=new URL(path,siteOrigin),pathname=url.pathname.replace(/\/$/,"")||"/"
  const base=staticPages[pathname]
  const article=item && pathname===`/${item.kind}/${item.id}`?item:undefined
  const page=url.searchParams.get("page")
  const paginated=!!base && ["/research","/notice"].includes(pathname) && /^[1-9]\d{0,3}$/.test(page??"") && Number(page)>1
  const canonicalPath=pathname==="/alumni"?"/network":pathname
  const canonical=siteOrigin+canonicalPath+(paginated?`?page=${page}`:"")
  const filtered=["q","category","semester","industry","activity","reportType"].some(key=>url.searchParams.has(key)&&url.searchParams.get(key))
  const noindex=(!base&&!article)||!!base?.noindex||filtered
  const title=article?articleTitle(article):pathname==="/"?base.title:`${base?.title??"페이지를 찾을 수 없습니다"}${paginated?` · ${page}페이지`:""} | ${SITE_SHORT_NAME_KO}`
  const description=(article?[article.company,article.ticker,article.industry,article.summary||`${article.author||"SMP"}의 ${article.category||"리포트"}`].filter(Boolean).join(" · "):base?.description??"요청한 페이지를 찾을 수 없습니다.").replace(/\s+/g," ").slice(0,200)
  let image=`${siteOrigin}/backgrounds/research-desk.webp`
  const cover=article && publicCover(article)
  if(cover) image=siteOrigin+cover.previewUrl
  const schema:unknown[]=[organization,{"@type":"WebSite","@id":`${siteOrigin}/#website`,url:siteOrigin,name:siteName,alternateName:SITE_ALTERNATE_NAMES,inLanguage:"ko-KR",publisher:{"@id":organization["@id"]}}]
  if(article) schema.push({"@type":article.kind==="research"?"Report":"Article","@id":`${canonical}#article`,url:canonical,mainEntityOfPage:canonical,headline:article.title,description,inLanguage:"ko-KR",image,
    ...(article.date?{datePublished:article.date}:{}),...(article.editedAt?{dateModified:article.editedAt}:{}),
    author:article.author?{"@type":/SMP|팀|R[1-4]/i.test(article.author)?"Organization":"Person",name:article.author}:{"@id":organization["@id"]},publisher:{"@id":organization["@id"]},articleSection:article.industry||article.category})
  if(pathname!=="/" && (base||article)) schema.push({"@type":"BreadcrumbList",itemListElement:[
    {"@type":"ListItem",position:1,name:"SMP",item:siteOrigin},
    ...(article?[{"@type":"ListItem",position:2,name:staticPages[`/${article.kind}`].title,item:`${siteOrigin}/${article.kind}`}]:[]),
    {"@type":"ListItem",position:article?3:2,name:article?.title||base?.title,item:canonical},
  ]})
  return {title,description,canonical,image,noindex,schema:{"@context":"https://schema.org","@graph":schema},article:!!article}
}
export function metadataHtml(path:string,item?:SeoItem) {
  const m=pageMetadata(path,item),tag=(name:string,value:string,property=false)=>`<meta data-smp-seo ${property?"property":"name"}="${name}" content="${escapeHtml(value)}">`
  return `<title data-smp-seo>${escapeHtml(m.title)}</title>`+tag("description",m.description)+`<link data-smp-seo rel="canonical" href="${escapeHtml(m.canonical)}">`+
    tag("robots",m.noindex?"noindex, follow":"index, follow, max-image-preview:large")+tag("og:site_name",siteName,true)+tag("og:locale","ko_KR",true)+tag("og:type",m.article?"article":"website",true)+tag("og:title",m.title,true)+tag("og:description",m.description,true)+tag("og:url",m.canonical,true)+tag("og:image",m.image,true)+tag("twitter:card","summary_large_image")+tag("twitter:title",m.title)+tag("twitter:description",m.description)+tag("twitter:image",m.image)+`<script data-smp-seo type="application/ld+json">${scriptJson(m.schema)}</script>`
}
export function injectPage(template:string,path:string,body:string,item?:SeoItem,bootstrap?:{path:string;value:unknown}) {
  return template.replace(/<!--smp-head-->[\s\S]*?<!--\/smp-head-->/,()=>`<!--smp-head-->${metadataHtml(path,item)}<!--/smp-head-->`)
    .replace('<div id="seo-content"></div>',()=>body)
    .replace("</body>",()=>`${bootstrap?`<script id="smp-initial-data" type="application/json">${scriptJson(bootstrap)}</script>`:""}</body>`)
}
