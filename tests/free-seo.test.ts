import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import type { Database, Statement } from '../cloudflare/bindings'
import type { ContentItem, NotionPage } from '../lib/content-model'
import type { Env } from '../free/server/types'
import { storePage, rebuildDocuments } from '../free/server/catalog'
import { blockHtml, detailHtml, listHtml, sitemapXml } from '../free/seo/content'
import { injectPage, metadataHtml, pageMetadata } from '../free/seo/metadata'
import worker from '../free/server/worker'
import {readDetail} from '../free/server/pages'

const id='a0000000000000000000000000000001'
const item:ContentItem={id,kind:'research',title:'기업 분석',summary:'목표주가 100,000원',date:'2020-01-01',category:'기업분석',author:'SMP',pinned:false,attachments:[],externalUrl:null}
const shell='<!doctype html><html><head><!--smp-head--><title>Shell</title><!--/smp-head--></head><body><div id="seo-content"></div></body></html>'

test('canonical pages, pagination and search filters have distinct indexing rules',()=>{
  assert.equal(pageMetadata('/about?utm_source=example').canonical,'https://pnusmp.com/about')
  assert.equal(pageMetadata('/alumni/').canonical,'https://pnusmp.com/network')
  const second=pageMetadata('/research?page=2&source=example')
  assert.equal(second.canonical,'https://pnusmp.com/research?page=2')
  assert.match(second.title,/2페이지/);assert.equal(second.noindex,false)
  for(const path of ['/search?q=삼성','/research?industry=반도체','/research?q=기업','/unknown']) assert.equal(pageMetadata(path).noindex,true)
  const article=pageMetadata(`/research/${id}`,item)
  assert.equal(article.noindex,false);assert.match(article.title,/기업 분석/)
  assert.equal(pageMetadata(`/notice/${id}`,item).noindex,true)
  assert.equal((article.schema['@graph'][2] as any)['@type'],'Report')
})

test('search metadata identifies SMP and the report company without changing the author headline',()=>{
  const homepage=pageMetadata('/')
  const organization=homepage.schema['@graph'][0] as Record<string,unknown>
  assert.equal(organization.name,'부산대학교 금융투자학회 SMP')
  assert.deepEqual(organization.alternateName,['SMP','부산대 SMP','Stock Masters of PNU'])
  assert.deepEqual(organization.sameAs,['https://cafe.naver.com/smppnu','https://www.instagram.com/smp_pnu/'])
  const report={...item,title:'새로운 성장의 시작',company:'테스트기업',ticker:'123456'}
  const meta=pageMetadata(`/research/${id}`,report)
  assert.equal(meta.title,'테스트기업 (123456) 기업분석 · 새로운 성장의 시작 | 부산대 SMP')
  assert.equal((meta.schema['@graph'][2] as any).headline,report.title)
  const named=pageMetadata(`/research/${id}`,{...report,title:'테스트기업, 새로운 성장의 시작'})
  assert.equal((named.title.match(/테스트기업/g)??[]).length,1)
  const notice=pageMetadata(`/notice/${id}`,{...report,kind:'notice'})
  assert.equal(notice.title,'새로운 성장의 시작 | 부산대 SMP')
  const titles=['/','/about','/curriculum','/recruit','/research'].map(path=>pageMetadata(path).title)
  assert.equal(new Set(titles).size,titles.length)
})

test('CMS text cannot break HTML, JSON-LD or the one-use bootstrap script',()=>{
  const malicious={...item,title:'</title><script>alert(1)</script>',summary:'$& $` $\' </script><img src=x onerror=alert(1)>'}
  const html=injectPage(shell,`/research/${id}`,detailHtml(malicious,[]),malicious,{path:`/api/detail/research/${id}`,value:{item:malicious}})
  assert.doesNotMatch(html,/<script>alert|<img src=x|<\/title><script>/)
  const json=html.match(/id="smp-initial-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
  assert.equal(JSON.parse(json).value.item.summary,malicious.summary)
  const schema=html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]
  assert.equal(JSON.parse(schema)['@graph'][2].headline,malicious.title)
  assert.equal((html.match(/<title /g)??[]).length,1)
  assert.match(metadataHtml(`/research/${id}`,item),/og:url/)
})

test('Notion text, safe links, images and PDF downloads remain accessible before JavaScript',()=>{
  const html=blockHtml([
    {id:'p',type:'paragraph',paragraph:{rich_text:[{plain_text:'상세 안내',href:'https://pnusmp.com/about',annotations:{bold:true}},{plain_text:'<bad>',href:'javascript:alert(1)'}]}},
    {id:'i',type:'image',image:{external:{url:'https://pnusmp.com/report-covers/example.webp'},caption:[{plain_text:'행사 안내'}]}},
  ])
  assert.match(html,/<a href="https:\/\/pnusmp.com\/about"[^>]*><strong>상세 안내/)
  assert.match(html,/alt="행사 안내"/);assert.match(html,/&lt;bad&gt;/);assert.doesNotMatch(html,/javascript:/)
  const pdf=detailHtml({...item,externalUrl:'https://drive.google.com/file/d/fixture-report-1/view'},[])
  assert.match(pdf,new RegExp(`/api/content/research/${id}/pdf\\?source=external&amp;download=1`))
})

test('list HTML exposes crawlable pagination; sitemap includes only provided public entries',()=>{
  const items=Array.from({length:25},(_,i)=>({...item,id:`a${(i+1).toString(16).padStart(31,'0')}`,title:`기업 ${i+1}`}))
  const list=listHtml('research',items,new URLSearchParams('page=2'))
  assert.equal(list.page,2);assert.equal(list.totalPages,3)
  assert.equal((list.body.match(/<li /g)??[]).length,12)
  assert.match(list.body,/href="\/research\?page=3"/)
  const xml=sitemapXml([item])
  assert.match(xml,/<loc>https:\/\/pnusmp.com\/research\/a0000000000000000000000000000001<\/loc>/)
  assert.doesNotMatch(xml,/<loc>[^<]*(?:\/search|\/alumni|api\/)/)
  assert.doesNotMatch(xml,/<lastmod>/) // Do not invent modification dates.
})

test('HTML details recheck publication, hide outdated bodies, and skip Notion for unknown IDs',async()=>{
  Object.assign(globalThis,{__SMP_FIXTURE__:false})
  const sqlite=new DatabaseSync(':memory:')
  for(const name of ['0002_free_runtime','0003_free_guards','0004_document_versions','0006_report_cover_cache']) sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),'utf8'))
  const prepare=(sql:string,params:unknown[]=[]):Statement=>({
    bind:(...args)=>prepare(sql,args),
    async first<T>(){return(sqlite.prepare(sql).get(...params as any[])??null) as T|null},
    async all<T>(){return{results:sqlite.prepare(sql).all(...params as any[]) as T[]}},
    async run(){return sqlite.prepare(sql).run(...params as any[])},
  })
  const db:Database={prepare,batch:async statements=>Promise.all(statements.map(s=>s.run()))}
  const source='33333333333343338333333333333333',pending:Promise<unknown>[]=[]
  const page:NotionPage={id,object:'page',created_time:'2020-01-01T00:00:00Z',last_edited_time:'2020-01-01T00:00:00Z',parent:{type:'data_source_id',data_source_id:source},properties:{제목:{type:'title',title:[{plain_text:'공개 검증 제목'}]},공개:{type:'checkbox',checkbox:true},게시일:{type:'date',date:{start:'2020-01-01'}}}}
  let reads=0
  const env:Env={CMS_DB:db,ASSETS:{fetch:async()=>new Response(shell,{headers:{'Content-Security-Policy':"default-src 'self'"}})},NOTION_TOKEN:'fixture',NOTION_REPORTS_DATA_SOURCE_ID:source,NOTION_FETCH:async()=>{reads++;return Response.json(page)}}
  const request=(path:string,method='GET')=>worker.fetch(new Request(`https://pnusmp.com${path}`,{method}),env,{waitUntil:p=>pending.push(p)})
  const body=JSON.stringify([{id:'p',type:'paragraph',paragraph:{rich_text:[{plain_text:'현재 공개 본문'}]}}])
  try {
    await storePage(env,page,'research');await rebuildDocuments(env)
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now())
    sqlite.prepare('UPDATE free_content SET blocks=?,body_revision=? WHERE id=?').run(body,page.last_edited_time!,id)
    let response=await request(`/research/${id}`)
    assert.equal(response.status,200);assert.equal(reads,1)
    assert.match(response.headers.get('cache-control')!,/no-store/)
    assert.equal(response.headers.get('content-security-policy'),"default-src 'self'")
    let html=await response.text()
    assert.match(html,/<h1[^>]*>공개 검증 제목<\/h1>/);assert.match(html,/현재 공개 본문/)
    assert.match(html,/smp-initial-data/)
    const relatedItem={...item,id:'b'.repeat(32),company:'동일 기업'}
    page.properties.기업명={type:'rich_text',rich_text:[{plain_text:'동일 기업'}]}
    const detail=await readDetail(env,{waitUntil:p=>pending.push(p)},'research',id,async()=>Response.json({items:[relatedItem]}))
    assert.equal(detail?.related?.items[0].id,relatedItem.id)
    const stale=await readDetail(env,{waitUntil:p=>pending.push(p)},'research',id,async()=>new Response('',{status:503}))
    assert.equal(stale?.related,null)
    assert.ok(stale?.item,'stale catalogue must not block a valid detail')
    page.last_edited_time='2020-01-02T00:00:00Z'
    html=await(await request(`/research/${id}`)).text()
    assert.doesNotMatch(html,/현재 공개 본문/);assert.match(html,/본문을 준비/)
    await Promise.all(pending)
    page.properties.공개.checkbox=false
    response=await request(`/research/${id}`)
    assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/공개 검증 제목|현재 공개 본문/)
    const before=reads
    assert.equal((await request('/research/a0000000000000000000000000000999')).status,404)
    assert.equal(reads,before)
    assert.equal((await request(`/research/${id}`,'POST')).status,405)
    // Lists and sitemaps share the same freshness and withdrawal checks.
    await storePage(env,page,'research');await rebuildDocuments(env)
    const xml=await(await request('/sitemap-research.xml')).text()
    assert.doesNotMatch(xml,new RegExp(`/research/${id}`))
    sqlite.prepare('UPDATE free_sync SET checked_at=?').run(Date.now()-301_000)
    assert.equal((await request('/sitemap-research.xml')).status,503)
    assert.equal((await request('/research')).status,503)
  } finally { await Promise.all(pending);sqlite.close() }
})

test('cover discovery, large sharing images and related links use the same public report data',()=>{
  const cover={url:`/report-covers/${id}/${'a'.repeat(64)}.webp`,previewUrl:`/report-covers/${id}/${'b'.repeat(64)}.webp`,width:2048,height:2899}
  const report={...item,cover}
  const related={label:'같은 업종의 리포트',items:[{...item,id:'b'.repeat(32),title:'관련 <기업>'}]}
  const html=detailHtml(report,[],false,related)
  assert.match(html,new RegExp(`src="${cover.previewUrl}"`));assert.match(html,/alt="기업 분석 리포트 표지"/)
  assert.match(html,/href="\/research\/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);assert.match(html,/관련 &lt;기업&gt;/)
  assert.equal(pageMetadata(`/research/${id}`,report).image,'https://pnusmp.com'+cover.previewUrl)
  const xml=sitemapXml([report],false)
  assert.match(xml,/xmlns:image=/);assert.match(xml,new RegExp(`<image:loc>https://pnusmp.com${cover.previewUrl}</image:loc>`))
  assert.match(listHtml('research',[report],new URLSearchParams()).body,/loading="lazy"/)
  const foreign={...report,cover:{...cover,url:'https://bad.example/tracking'}}
  assert.doesNotMatch(detailHtml(foreign,[]),/tracking/);assert.doesNotMatch(sitemapXml([foreign]),/image:loc/)
  assert.doesNotMatch(sitemapXml([]),/report-covers/)
})
