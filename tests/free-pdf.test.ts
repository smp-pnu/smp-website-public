import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { publishedPdf } from "../free/server/pdf"
import type { ContentItem } from "../lib/content-model"

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })
const bytes = new TextEncoder().encode("%PDF-1.7\npublic report")
const item: ContentItem = {id:"a0000000000000000000000000000001",kind:"research",title:"테스트 리포트",summary:"",date:"2026-01-01",category:"",author:"",pinned:false,attachments:[],externalUrl:"https://drive.google.com/file/d/abcdefghijk123/view",editedAt:"2026-01-01T00:00:00Z"}
function setup() {
  const entries = new Map<string, {bytes: ArrayBuffer; headers: Headers}>()
  const tasks: Promise<unknown>[] = []
  let fetches = 0, puts = 0
  global.fetch = async () => {fetches++; return new Response(bytes, {headers:{"content-length":String(bytes.length),"accept-ranges":"bytes"}})}
  const cache = {
    async match(key: Request) {const entry=entries.get(key.url);return entry && new Response(entry.bytes.slice(0), {headers:entry.headers})},
    async put(key: Request, response: Response) {puts++;entries.set(key.url, {bytes:await response.arrayBuffer(),headers:new Headers(response.headers)})},
  }
  const request = (query="",headers?:HeadersInit) => new Request(`https://smp.test/api/content/research/${item.id}/pdf?source=external${query}`,{headers})
  const ctx = {waitUntil(task: Promise<unknown>) {tasks.push(task)}}
  const read = async (report=item,query="",headers?:HeadersInit) => {
    const response=await publishedPdf(request(query,headers),report,ctx,cache)
    const body=await response.arrayBuffer();await Promise.all(tasks)
    return {response,body}
  }
  return {entries,tasks,cache,request,ctx,read,counts:()=>({fetches,puts})}
}

test("recent complete PDFs are reused with private client headers and correct download disposition",async()=>{
  const s=setup()
  const cold=await s.read();assert.match(cold.response.headers.get("server-timing")!,/MISS/)
  const warm=await s.read();assert.match(warm.response.headers.get("server-timing")!,/HIT/)
  assert.deepEqual(new Uint8Array(warm.body),bytes)
  assert.match(warm.response.headers.get("cache-control")!,/private, no-store/)
  assert.equal(warm.response.headers.get("x-smp-pdf-saved-at"),null)
  const download=await s.read(item,"&download=1")
  assert.match(download.response.headers.get("content-disposition")!,/^attachment;/)
  assert.match((await s.read()).response.headers.get("content-disposition")!,/^inline;/)
  assert.deepEqual(s.counts(),{fetches:1,puts:1})
  const [key,entry]=[...s.entries][0]
  assert.match(key,/\/api\/cache\/pdf\/v1\/[a-f0-9]{64}$/)
  assert.doesNotMatch(key,/abcdefghijk123/)
  assert.equal(entry.headers.get("cache-control"),"public, max-age=300")
})

test("source changes, revisions and expired cache entries require a fresh PDF",async()=>{
  const s=setup();await s.read()
  await s.read({...item,externalUrl:"https://drive.google.com/file/d/another-file-123/view"})
  await s.read({...item,editedAt:"2026-01-02T00:00:00Z"})
  assert.equal(s.counts().fetches,3)
  for(const entry of s.entries.values())entry.headers.set("x-smp-pdf-saved-at",String(Date.now()-300_001))
  assert.match((await s.read()).response.headers.get("server-timing")!,/MISS/)
  assert.equal(s.counts().fetches,4)
})

test("a cold range stays a range and never starts a whole-file cache fill",async()=>{
  const s=setup();let calls=0
  global.fetch=async(_url,init)=>{
    calls++;assert.equal(new Headers(init?.headers).get("range"),"bytes=0-4")
    return new Response(bytes.slice(0,5),{status:206,headers:{"content-type":"application/pdf","content-range":`bytes 0-4/${bytes.length}`}})
  }
  const result=await s.read(item,"",{Range:"bytes=0-4"})
  assert.equal(result.response.status,206);assert.equal(result.body.byteLength,5)
  assert.equal(s.counts().puts,0);assert.equal(calls,1)
  assert.equal((await s.read(item,"",{Range:"bytes=0-4,10-14"})).response.status,416)
  assert.equal(calls,1)
})

test("cache failures do not prevent streaming the validated PDF",async()=>{
  const s=setup()
  s.cache.match=async()=>{throw new Error("cache unavailable")}
  s.cache.put=async()=>{throw new Error("cache unavailable")}
  const response=await publishedPdf(s.request(),item,s.ctx,s.cache)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes)
  await Promise.all(s.tasks)
})

test("concurrent cold readers do not duplicate or multiply background cache writers",async()=>{
  const s=setup();let release!:()=>void
  const paused=new Promise<void>(resolve=>{release=resolve})
  let writes=0
  s.cache.put=async(_key,response)=>{writes++;await paused;await response.arrayBuffer()}
  const reports=[item,item,item,{...item,editedAt:"second"},{...item,editedAt:"third"}]
  await Promise.all(reports.map(async report=>{
    const response=await publishedPdf(s.request(),report,s.ctx,s.cache)
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes)
  }))
  assert.equal(writes,2,"one writer per key and at most two cloned bodies per isolate")
  release();await Promise.all(s.tasks)
})

test("downloads, unknown lengths and files over 32 MiB are not copied into cache",async()=>{
  for(const length of [undefined,33*1024*1024]) {
    const s=setup()
    global.fetch=async()=>new Response(bytes,{headers:length?{"content-length":String(length)}:{}})
    await s.read();assert.equal(s.counts().puts,0)
  }
  const s=setup();await s.read(item,"&download=1");assert.equal(s.counts().puts,0)
})
