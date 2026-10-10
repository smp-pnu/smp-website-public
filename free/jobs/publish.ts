import { mkdir,writeFile,access,readdir,rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { remoteDatabase } from "./database"
import { prepareBody,prepareCover,type Cover } from "./prepare"
import { internal } from "../server/jobs"
import { notion,published,source } from "../server/notion"
import { rebuildDocuments,removePage,storePages,storePage } from "../server/catalog"
import { Busy,type Env } from "../server/types"
import { normalizeId,type ContentItem,type NotionPage } from "../../lib/content-model"
import { syncReportMetadataUsing } from "../../lib/report-metadata-service"

type Job={id:string;kind:"research"|"notice";revision:string;token:string;item:ContentItem;cover:Cover|null}
type Completed={job:Job;blocks:Awaited<ReturnType<typeof prepareBody>>;cover:Cover|null}
const required=(name:string)=>{const value=process.env[name];if(!value) throw new Error(`Missing ${name}`);return value}
function command(file:string,args:string[]=[]) {
  const result=spawnSync(process.execPath,[file,...args],{stdio:"inherit",env:process.env})
  if(result.status!==0) throw new Error(`Publishing step failed: ${file}`)
}
async function main() {
  if(process.env.SMP_FREE_DEPLOY_APPROVED!=="1") throw new Error("Production publishing has not been enabled")
  const origin=new URL(required("SMP_FREE_ORIGIN"))
  if(origin.protocol!=="https:" || origin.username || origin.password || origin.pathname!=="/" || origin.search || origin.hash) throw new Error("Invalid publisher origin")
  const account=required("CLOUDFLARE_ACCOUNT_ID"),database=required("SMP_FREE_DATABASE_ID")
  if(database==="16cf8db5-1f95-48f3-af68-b32cfa7f7908") throw new Error("Production publisher cannot write to the synthetic trial database")
  let nextRequest=0,requestCount=0
  const env:Env={...process.env,CMS_DB:remoteDatabase(account,database,required("CLOUDFLARE_API_TOKEN")),ASSETS:{fetch},NOTION_FETCH:async(input,init)=>{
    if(++requestCount>300) throw new Error("Publisher request limit reached")
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextRequest-Date.now())))
    nextRequest=Date.now()+1100
    return fetch(input,init)
  }}
  // No overlapping publishing runs, even if a second runner/manual job starts.
  const now=Date.now()
  const lock=await env.CMS_DB.prepare(`INSERT INTO free_controls(name,until_at) VALUES ('publisher',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<? RETURNING until_at`).bind(now+14*60_000,now).first()
  if(!lock) { console.log("Publisher already active");return }
  const acquiredUntil=now+14*60_000
  const deadline=Date.now()+11*60_000
  try {
    await reconcile(env)
    const complete:Completed[]=[]
    for(let count=0;count<4 && Date.now()<deadline;count++) {
      const claim=await internal(new Request(`${origin}api/internal/jobs/claim`,{method:"POST"}),env)
      const {job}=await claim.json() as {job:Job|null}
      if(!job) break
      try {
        if(job.kind==="research" && process.env.NOTION_METADATA_WRITE_ENABLED==="true") {
          await syncReportMetadataUsing(job.id,async <T>(path:string,body?:unknown,method?:"PATCH")=>{
            const result=await notion<T>(env,path,body,method);if(!result) throw new Error("Report removed");return result
          })
        }
        const page=await notion<NotionPage>(env,`pages/${job.id}`)
        if(!page) {await removePage(env,job.id);continue}
        await storePage(env,page,job.kind)
        const item=await published(env,job.kind,job.id)
        if(!item) {await removePage(env,job.id);continue}
        job.revision=item.editedAt!
        const blocks=await prepareBody(env,item,origin.href)
        const cover=await prepareCover(item,job.cover)
        complete.push({job,blocks,cover})
      } catch(error) {
        await fail(env,origin,job,error instanceof Busy?error.seconds*1000:900_000)
        console.error("One publication was deferred; original content remains in Notion/Drive")
        if(error instanceof Busy) throw error
      }
    }
    if(!complete.length && process.env.SMP_FORCE_BUILD!=="1") { console.log("No asset deployment needed");return }
    // A cache eviction must never remove covers from the next deployment.
    // Recover every currently referenced asset from this site's last deployment;
    // if even one recovery fails, leave that deployment in place.
    await mkdir(".smp-cache/covers",{recursive:true})
    const records=await env.CMS_DB.prepare("SELECT cover,blocks FROM free_content").all<{cover:string|null;blocks:string|null}>()
    const assets=new Set<string>()
    for(const row of records.results) {
      const text=[row.cover,row.blocks].filter(Boolean).join(" ")
      for(const match of text.matchAll(/\/report-covers\/[a-f0-9]{32}\/[a-f0-9]{64}\.webp/g)) assets.add(match[0])
    }
    for(const result of complete) for(const match of JSON.stringify({blocks:result.blocks,cover:result.cover}).matchAll(/\/report-covers\/[a-f0-9]{32}\/[a-f0-9]{64}\.webp/g)) assets.add(match[0])
    if(assets.size>5000) throw new Error("Asset safety limit exceeded")
    for(const path of assets) {
      const file=`.smp-cache/covers/${path.slice('/report-covers/'.length)}`
      try {await access(file);continue} catch {}
      const response=await fetch(new URL(path,origin),{redirect:"error",signal:AbortSignal.timeout(20_000)})
      if(!response.ok || !response.headers.get('content-type')?.startsWith('image/webp') || Number(response.headers.get('content-length'))>10*1024*1024) {await response.body?.cancel();throw new Error("Cannot recover a published image")}
      const bytes=Buffer.from(await response.arrayBuffer())
      if(bytes.length>10*1024*1024 || createHash('sha256').update(bytes).digest('hex')!==path.split('/').at(-1)!.slice(0,-5)) throw new Error("Recovered image integrity check failed")
      await mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});await writeFile(file,bytes)
    }
    // Only generated, publicly referenced images belong in a deployment.
    for(const dir of await readdir(".smp-cache/covers",{withFileTypes:true})) {
      if(!dir.isDirectory() || !/^[a-f0-9]{32}$/.test(dir.name)) continue
      for(const name of await readdir(`.smp-cache/covers/${dir.name}`)) {
        if(/^[a-f0-9]{64}\.webp$/.test(name) && !assets.has(`/report-covers/${dir.name}/${name}`)) await rm(`.smp-cache/covers/${dir.name}/${name}`)
      }
    }
    command("scripts/build-free.mjs")
    command("scripts/deploy-free.mjs")
    if(process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,"assets_changed=true\n",{flag:"a"})
    for(const result of complete) {
      const response=await internal(new Request(`${origin}api/internal/jobs/${result.job.id}/complete`,{method:"POST",body:JSON.stringify({token:result.job.token,revision:result.job.revision,blocks:result.blocks,cover:result.cover})}),env)
      if(!response.ok) console.error("Publication changed during deploy; it will be prepared again")
    }
    console.log(JSON.stringify({prepared:complete.length,notionRequests:requestCount}))
  } finally {
    await env.CMS_DB.prepare("DELETE FROM free_controls WHERE name='publisher' AND until_at=?").bind(acquiredUntil).run()
  }
}
async function fail(env:Env,origin:URL,job:Job,retryAfterMs=900_000) {
  await internal(new Request(`${origin}api/internal/jobs/${job.id}/fail`,{method:"POST",body:JSON.stringify({token:job.token,revision:job.revision,retryAfterMs})}),env)
}
async function reconcile(env:Env) {
  // A completed full pass recovers missed webhooks, deleted pages, future-dated
  // publications and expired member photo links. Never prune a partial pass.
  const started=new Date().toISOString()
  for(const kind of ["research","notice","members"] as const) {
    const ids:string[]=[],cursors=new Set<string>();let cursor:string|null=null
    do {
      const batch:{results:NotionPage[];has_more:boolean;next_cursor:string|null}|null=await notion(env,`data_sources/${source(env,kind)}/query`,{page_size:100,...(cursor?{start_cursor:cursor}:{})})
      if(!batch) throw new Error("CMS source unavailable")
      ids.push(...batch.results.flatMap(page=>{const id=normalizeId(page.id);return id?[id]:[]}))
      if(ids.length>2000) throw new Error("CMS source exceeds the reviewed 2000-page limit")
      await storePages(env,batch.results,kind)
      cursor=batch.has_more?batch.next_cursor:null
      if(batch.has_more && (!cursor || cursors.has(cursor))) throw new Error("Repeated CMS cursor")
      if(cursor)cursors.add(cursor)
    } while(cursor)
    const missing=await env.CMS_DB.prepare("SELECT id FROM free_content WHERE kind=? AND revision<=? AND id NOT IN(SELECT value FROM json_each(?))").bind(kind,started,JSON.stringify(ids)).all<{id:string}>()
    for(const {id} of missing.results) await removePage(env,id,started)
    await env.CMS_DB.prepare("UPDATE free_sync SET checked_at=?,watermark=?,cursor=NULL,started_at=NULL WHERE kind=?").bind(Date.now(),started,kind).run()
  }
  await rebuildDocuments(env)
}
void main().catch(error=>{console.error(error instanceof Busy?`Publisher paused for at least ${error.seconds}s`:error instanceof Error?error.message:"Publisher failed");process.exitCode=1})
