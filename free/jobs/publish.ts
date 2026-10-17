import { mkdir,writeFile,access,readdir,rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { remoteDatabase } from "./database"
import { prepareBody,prepareCover,prepareMemberPhoto,type Cover } from "./prepare"
import { internal } from "../server/jobs"
import { notion,source } from "../server/notion"
import { rebuildDocuments,removePage,storePage } from "../server/catalog"
import { Busy,type Env } from "../server/types"
import { normalizeId,toContentItem,type ContentItem,type NotionPage } from "../../lib/content-model"
import { toMember,type Member } from "../../lib/member-model"
import { reconcileIfDue } from "./reconcile"
import { syncReportMetadataUsing } from "../../lib/report-metadata-service"
import { ensureReportCoverCache } from "./report-cover-cache"
import { ensureSyncRuns } from "./sync-schema"
import { ensurePublicationChecks } from "./publication-schema"
import { ensureJobFailures } from "./job-schema"
import { jobErrorCode, type JobErrorCode } from "../server/job-errors"
import { repairRegionalImages } from "./regional-image-repair"
import { publicationAssets, requiresAssetDeployment } from "./publication-assets"
import { prepareReaderAssets } from "./reader-assets"
import { queueReaderBackfill } from "./reader-backfill"

import {ensureAdminSchema,setAdminConfig} from "./admin-schema"
import {syncAdminStatus} from "./admin-status"
import {prepareRecruitment} from "./recruitment"

type Job={id:string;kind:"research"|"notice"|"members";revision:string;token:string;item:ContentItem|Member;cover:Cover|null}
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
  const libraryMigration=process.env.SMP_CMS_OPERATION==="prepare-library"
  let nextRequest=0,requestCount=0
  const env:Env={...process.env,NOTION_WORKLOAD:"publisher",CMS_DB:remoteDatabase(account,database,required("CLOUDFLARE_API_TOKEN")),ASSETS:{fetch},NOTION_FETCH:async(input,init)=>{
    if(++requestCount>(libraryMigration?1000:300)) throw new Error("Publisher request limit reached")
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextRequest-Date.now())))
    nextRequest=Date.now()+1100
    return fetch(input,init)
  }}
  await ensureReportCoverCache(env.CMS_DB)
  await ensureSyncRuns(env.CMS_DB)
  await ensurePublicationChecks(env.CMS_DB)
  await ensureJobFailures(env.CMS_DB)
  await ensureAdminSchema(env.CMS_DB)
  // No overlapping publishing runs, even if a second runner/manual job starts.
  const now=Date.now(),leaseMs=(libraryMigration?175:14)*60_000
  const lock=await env.CMS_DB.prepare(`INSERT INTO free_controls(name,until_at) VALUES ('publisher',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<? RETURNING until_at`).bind(now+leaseMs,now).first()
  if(!lock) { console.log("Publisher already active");return }
  const acquiredUntil=now+leaseMs
  const deadline=Date.now()+(libraryMigration?150:11)*60_000
  env.NOTION_WAIT_UNTIL=deadline
  try {
    const recruitment=await prepareRecruitment(env)
    const forceBuild=process.env.SMP_FORCE_BUILD==="1" || recruitment.changed
    await reconcileIfDue(env)
    await repairRegionalImages(env.CMS_DB)
    if(libraryMigration || !forceBuild) await queueReaderBackfill(env,libraryMigration)
    const complete:Completed[]=[]
    for(let count=0;count<(libraryMigration?200:4) && Date.now()<deadline;count++) {
      let claim:Response
      try {claim=await internal(new Request(`${origin}api/internal/jobs/claim`,{method:"POST"}),env,{libraryMigration})}
      catch(error) {if(error instanceof Busy && complete.length){console.warn("Preparation quota reached; deploying completed work before deferring the remainder");break}throw error}
      const {job}=await claim.json() as {job:Job|null}
      if(!job) break
      try {
        if(!libraryMigration && job.kind==="research" && process.env.NOTION_METADATA_WRITE_ENABLED==="true") {
          await syncReportMetadataUsing(job.id,async <T>(path:string,body?:unknown,method?:"PATCH")=>{
            const result=await notion<T>(env,path,body,method);if(!result) throw new Error("Report removed");return result
          })
        }
        const page=await notion<NotionPage>(env,`pages/${job.id}`)
        if(!page || page.parent?.type!=="data_source_id" || normalizeId(page.parent.data_source_id??"")!==source(env,job.kind)) {
          if(await removePage(env,job.id)) await rebuildDocuments(env,[job.kind]);continue
        }
        if(await storePage(env,page,job.kind)) await rebuildDocuments(env,[job.kind])
        const item=job.kind==="members"?toMember(page,source(env,"members")):toContentItem(page,job.kind)
        if(!item) continue
        job.revision=page.last_edited_time??page.created_time
        // A reader-only migration does not rewrite Notion or re-read unchanged
        // article blocks. Normal publication still prepares the entire article.
        const cachedBody=libraryMigration && job.kind==='research'
          ?await env.CMS_DB.prepare("SELECT blocks FROM free_content WHERE id=? AND body_revision=?").bind(job.id,job.revision).first<{blocks:string|null}>():null
        const blocks=cachedBody?.blocks?JSON.parse(cachedBody.blocks):job.kind==="members"?[]:await prepareBody(env,item as ContentItem,origin.href)
        const cover=job.kind==="members"?await prepareMemberPhoto(item as Member):await prepareCover(item as ContentItem,job.cover,undefined,libraryMigration)
        complete.push({job,blocks,cover})
        if(libraryMigration)console.log(JSON.stringify({readerPrepared:complete.length,id:job.id,pages:cover?.reader?.pageCount,packBytes:cover?.reader?.pagePack?.bytes}))
      } catch(error) {
        await fail(env,origin,job,error instanceof Busy?error.seconds*1000:900_000,jobErrorCode(error))
        console.error("One publication was deferred; original content remains in Notion/Drive")
        if(error instanceof Busy) {if(complete.length)break;throw error}
      }
    }
    if(!complete.length && !forceBuild) { console.log("No asset deployment needed");return }
    // Preparation stops early so deployment and publication checks can finish
    // inside the lease. Those checks still obey the shared Notion rate limits.
    env.NOTION_WAIT_UNTIL=acquiredUntil-60_000
    // A cache eviction must never remove covers from the next deployment.
    // Recover every currently referenced asset from this site's last deployment;
    // if even one recovery fails, leave that deployment in place.
    await mkdir(".smp-cache/covers",{recursive:true})
    const records=await env.CMS_DB.prepare("SELECT cover,blocks FROM free_content UNION ALL SELECT cover,NULL AS blocks FROM free_report_covers").all<{cover:string|null;blocks:string|null}>()
    const existing=publicationAssets(records.results.flatMap(row=>[row.cover?JSON.parse(row.cover):null,row.blocks?JSON.parse(row.blocks):null]),origin.origin)
    const incoming=publicationAssets(complete.flatMap(result=>[result.blocks,result.cover]),origin.origin)
    const readerChanged=complete.some(result=>JSON.stringify([result.cover?.reader?.pdf?.url,result.cover?.reader?.pdf?.chunkSize,result.cover?.reader?.pagePack?.url])!==JSON.stringify([result.job.cover?.reader?.pdf?.url,result.job.cover?.reader?.pdf?.chunkSize,result.job.cover?.reader?.pagePack?.url]))
    if(!requiresAssetDeployment(existing,incoming,forceBuild||readerChanged)) {
      await finishPublications(env,origin,complete)
      console.log(JSON.stringify({prepared:complete.length,notionRequests:requestCount,assetDeployment:false}))
      return
    }
    const assets=new Set([...existing,...incoming])
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
    const readerRecords=await env.CMS_DB.prepare("SELECT id,json_extract(item,'$.date') AS date,cover FROM free_content WHERE kind='research' AND cover IS NOT NULL").all<{id:string;date:string;cover:string}>()
    const updated=new Map(readerRecords.results.map(row=>[row.id,{id:row.id,date:row.date||"",cover:JSON.parse(row.cover)}]))
    for(const result of complete) if(result.job.kind==='research') updated.set(result.job.id,{id:result.job.id,date:(result.job.item as ContentItem).date||"",cover:result.cover})
    await prepareReaderAssets([...updated.values()],origin,Math.min(Date.now()+8*60_000,acquiredUntil-(libraryMigration?12:2)*60_000))
    command("scripts/build-free.mjs")
    command("scripts/deploy-free.mjs")
    await setAdminConfig(env.CMS_DB,"recruitment_deployed",recruitment.fingerprint)
    // Code releases can change catalogue projections without changing Notion.
    if(process.env.SMP_FORCE_BUILD==="1") await rebuildDocuments(env,["research","notice"])
    if(process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,"assets_changed=true\n",{flag:"a"})
    await finishPublications(env,origin,complete)
    console.log(JSON.stringify({prepared:complete.length,notionRequests:requestCount}))
  } finally {
    try { await syncAdminStatus(env) } catch { console.warn("Operations status update deferred") }
    await env.CMS_DB.prepare("DELETE FROM free_controls WHERE name='publisher' AND until_at=?").bind(acquiredUntil).run()
  }
}
async function finishPublications(env:Env,origin:URL,complete:Completed[]) {
  for(const result of complete) {
    const response=await internal(new Request(`${origin}api/internal/jobs/${result.job.id}/complete`,{method:"POST",body:JSON.stringify({token:result.job.token,revision:result.job.revision,blocks:result.blocks,cover:result.cover})}),env)
    if(!response.ok) console.error("Publication changed during preparation; it will be prepared again")
  }
}
async function fail(env:Env,origin:URL,job:Job,retryAfterMs=900_000,errorCode:JobErrorCode="publication_failed") {
  await internal(new Request(`${origin}api/internal/jobs/${job.id}/fail`,{method:"POST",body:JSON.stringify({token:job.token,revision:job.revision,retryAfterMs,errorCode})}),env)
}
void main().catch(error=>{console.error(error instanceof Busy?`Publisher paused for at least ${error.seconds}s`:error instanceof Error?error.message:"Publisher failed");process.exitCode=1})
