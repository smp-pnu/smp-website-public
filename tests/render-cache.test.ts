import {test} from "node:test"
import assert from "node:assert/strict"
import {RenderCache, rendered} from "../free/server/render-cache"
import {formatDate, sortContent, type ContentItem} from "../lib/content-model"
import {createContentSearchIndex, findContentMatches, selectContentPage} from "../lib/content-query"

test("render cache bounds memory and entries, expires, and never retains error/private responses", async()=>{
  const cache=new RenderCache(1000,2,100)
  const response=()=>({body:"x".repeat(100),headers:{"content-type":"text/html"}})
  await cache.put("a",response(),0);await cache.put("b",response(),0)
  assert.ok(cache.get("a",10))
  await cache.put("c",response(),10)
  assert.equal(cache.get("b",11),null);assert.ok(cache.get("a",11))
  assert.equal(cache.get("a",100),null)
  await cache.put("large",{body:"x".repeat(600),headers:{"content-type":"text/html"}},10)
  assert.equal(cache.get("large",11),null)
  for(const status of [301,404,429,503]) await cache.put(String(status),new Response("x",{status,headers:{"content-type":"text/html"}}),10)
  await cache.put("cookie",{body:"x",headers:{"content-type":"text/html","set-cookie":"private=1"}},10)
  for(const key of ["301","404","429","503","cookie"]) assert.equal(cache.get(key,11),null)
  assert.ok(cache.get("c",11))
})

test("each response is independent and a failed version read cannot serve a previous value", async()=>{
  let unavailable=false,version=1,calls=0
  const env={CMS_ADMIN_MODE:true,CMS_DB:{prepare(){return {bind(){return this},async first(){if(unavailable)throw Error("unavailable");return {version,catalogue:1}}}}},ASSETS:{fetch}}
  const request=new Request("https://pnusmp.com/notice")
  const render=async()=>{calls++;return {body:JSON.stringify({calls}),headers:{"content-type":"application/json"}}}
  const first=await rendered(request,env as never,"notice",render)
  first.headers.set("test","changed");await first.text()
  const hit=await rendered(request,env as never,"notice",render)
  assert.deepEqual(await hit.json(),{calls:1});assert.equal(hit.headers.has("test"),false)
  unavailable=true
  await assert.rejects(()=>rendered(request,env as never,"notice",render),/unavailable/)
  unavailable=false;version++
  assert.deepEqual(await(await rendered(request,env as never,"notice",render)).json(),{calls:2})
  await rendered(request,{...env,CMS_ADMIN_MODE:false} as never,"notice",render)
  await rendered(request,{...env,REPORT_PREVIEW:{}} as never,"notice",render)
  assert.equal(calls,4)
})

test("empty-search filtering and reused locale formatters preserve existing output",()=>{
  const items:ContentItem[]=Array.from({length:30},(_,i)=>({id:String(i),kind:"research",title:`기업 ${30-i}`,summary:"성장 전망",date:"2026-01-01",category:i%2?"기업":"산업",author:"R1",pinned:false,externalUrl:null,attachments:[],semester:i%2?"2026-1":"2026-2",industry:"반도체와반도체장비",company:i%2?"인바디":"티씨케이"}))
  for(const filters of [{},{semester:"2026-1"},{industry:"IT"},{company:"인바디"},{activity:"리서치"}]) {
    const expected=findContentMatches(createContentSearchIndex(items),"", "",Infinity,filters)
    if(filters.company)expected.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,"ko"))
    const actual=selectContentPage(items,"research",{...filters,q:"  "})
    assert.equal(actual.total,expected.length);assert.deepEqual(actual.visibleItems,expected.slice(0,12))
  }
  const expected=[...items].sort((a,b)=>b.semester!.localeCompare(a.semester!)||a.title.localeCompare(b.title,"ko",{numeric:true}))
  assert.deepEqual(sortContent(items),expected)
  for(const date of ["2026-01-01","2026-10-28T18:00:00Z"]) assert.equal(formatDate(date),new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(date)))
})
