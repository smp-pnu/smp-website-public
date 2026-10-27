import type { Database } from "../cloudflare/bindings"
import { guardedBatch } from "../admin-cloud/transaction"
import { publicReport, publicationLimits as limits, type ApprovedReport, type ReportSource } from "../admin-publication/model"
import { searchEntry, documentStatements } from "../free/server/catalog"
import { fingerprint, validateSnapshot } from "./source"
import { LocalPublicationAssets, prepareApprovedPdf, type PreparedEdition } from "./assets"
import { assertPreviewDatabase } from "./target"
export { assertPreviewDatabase } from "./target"

type Published = {id:string;approved:string;edition:string;item:string;cover:string;original:string}
export type PublisherResult = {published:number;withdrawn:number;reused:number;prepared:number;deferred:number;failed:number;unchanged:boolean;busy:boolean}
const revisionKey=(r:ApprovedReport)=>fingerprint(r)
export async function publishReports(source:ReportSource,db:Database,assets:LocalPublicationAssets,
  options:{now?:()=>number;prepare?:typeof prepareApprovedPdf}={}) {
  await assertPreviewDatabase(db)
  const now=options.now??Date.now,token=crypto.randomUUID(),started=now()
  const result:PublisherResult={published:0,withdrawn:0,reused:0,prepared:0,deferred:0,failed:0,unchanged:false,busy:false}
  const lock=await db.prepare("INSERT INTO preview_controls(key,value,token) VALUES('lease',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,token=excluded.token WHERE value<=? RETURNING token")
    .bind(started+limits.leaseMs,token,started).first()
  if(!lock)return {...result,busy:true}
  try {
    const snapshot=validateSnapshot(await source.snapshot()),live=new Map(snapshot.reports.map(r=>[r.id,r]))
    const previous=new Map((await db.prepare("SELECT * FROM preview_reports").all<Published>()).results.map(r=>[r.id,r]))
    // A source collision is never interpreted as permission to take ownership.
    const collision = await db.prepare("SELECT id FROM free_content WHERE id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM preview_reports WHERE preview_reports.id=free_content.id) LIMIT 1")
      .bind(JSON.stringify([...live.keys()])).first()
    if(collision)throw Error("Existing Notion content cannot be replaced by this preview")
    const expired=[...previous.keys()].filter(id=>!live.has(id))
    if(expired.length) {
      await guardedBatch(db,"EXISTS(SELECT 1 FROM preview_controls WHERE key='lease' AND token=? AND value>?)",[token,now()],[...expired.flatMap(id=>[
        db.prepare("DELETE FROM free_content WHERE id=? AND EXISTS(SELECT 1 FROM preview_reports WHERE id=?)").bind(id,id),
        db.prepare("DELETE FROM preview_reports WHERE id=?").bind(id),
      ]),...documentStatements({CMS_DB:db,ASSETS:{fetch}},["research"])])
      for(const id of expired)previous.delete(id)
      result.withdrawn=expired.length
    }
    const completed=new Map<string,{report:ApprovedReport;prepared:PreparedEdition}>()
    let tried=0
    for(const r of snapshot.reports) {
      const old=previous.get(r.id),key=revisionKey(r)
      if(old?.edition===key)continue
      try {
        const prior:ApprovedReport|undefined=old?JSON.parse(old.approved):undefined
        if(prior?.identity===r.identity) {
          const prepared={cover:JSON.parse(old!.cover),original:JSON.parse(old!.original)}
          await assets.verify(r,prepared);completed.set(r.id,{report:r,prepared});result.reused++;continue
        }
        const attempt=await db.prepare("SELECT attempts,next_at FROM preview_attempts WHERE edition=?").bind(key).first<{attempts:number;next_at:number}>()
        if(tried>=limits.perRun || now()-started>limits.leaseMs-180_000 || (attempt && (attempt.attempts>=limits.attempts || attempt.next_at>now()))) {result.deferred++;continue}
        const day=`day:${Math.floor(now()/86400000)}`
        const budget=await db.prepare("INSERT INTO preview_controls(key,value) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=value+1 WHERE value<? RETURNING value").bind(day,limits.perDay).first()
        if(!budget){result.deferred++;continue}
        tried++
        await db.prepare("INSERT INTO preview_attempts(edition,attempts,next_at) VALUES(?,1,?) ON CONFLICT(edition) DO UPDATE SET attempts=attempts+1,next_at=excluded.next_at,error=NULL").bind(key,now()+limits.retryMs).run()
        const prepared=await (options.prepare??prepareApprovedPdf)(r,await source.pdf(r),assets)
        await assets.verify(r,prepared)
        completed.set(r.id,{report:r,prepared});result.prepared++
      } catch {
        result.failed++
        await db.prepare("UPDATE preview_attempts SET error='preparation_failed' WHERE edition=?").bind(key).run()
      }
    }
    // No partial manifest or stale completion can publish while approval/order
    // changed during conversion. Prior complete editions stay intact.
    const latest=validateSnapshot(await source.snapshot())
    if(latest.fingerprint!==snapshot.fingerprint)throw Error("Approval or order changed during preparation; rerun the preview")
    const statements=[]
    for(const [rank,r] of snapshot.reports.entries()) {
      const ready=completed.get(r.id),old=previous.get(r.id)
      if(!ready&&!old)continue
      const selected=ready?.report??JSON.parse(old!.approved) as ApprovedReport
      const item=publicReport(selected,rank+1),encoded=JSON.stringify(item)
      if(!ready&&old?.item===encoded)continue
      const cover=ready?JSON.stringify(ready.prepared.cover):old!.cover,original=ready?JSON.stringify(ready.prepared.original):old!.original
      statements.push(
        db.prepare("INSERT INTO preview_reports(id,approved,edition,item,cover,original) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET approved=excluded.approved,edition=excluded.edition,item=excluded.item,cover=excluded.cover,original=excluded.original")
          .bind(r.id,JSON.stringify(selected),revisionKey(selected),encoded,cover,original),
        db.prepare("INSERT INTO free_content(id,kind,revision,item,search_entry,blocks,body_revision,cover) VALUES(?,'research',?,?,?,'[]',?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,item=excluded.item,search_entry=excluded.search_entry,blocks=excluded.blocks,body_revision=excluded.body_revision,cover=excluded.cover")
          .bind(r.id,item.editedAt,encoded,JSON.stringify(searchEntry(item)),item.editedAt,cover),
      )
      result.published++
    }
    if(statements.length)await guardedBatch(db,"EXISTS(SELECT 1 FROM preview_controls WHERE key='lease' AND token=? AND value>?)",[token,now()],[...statements,...documentStatements({CMS_DB:db,ASSETS:{fetch}},["research"])])
    result.unchanged=!result.published&&!result.withdrawn&&!result.failed&&!result.deferred
    // Local preview freshness only; no production Notion watermark is touched.
    await db.prepare("UPDATE free_sync SET checked_at=?").bind(now()).run()
    await db.prepare("DELETE FROM preview_controls WHERE key LIKE 'day:%' AND key<>?").bind(`day:${Math.floor(now()/86400000)}`).run()
    return result
  } finally { await db.prepare("DELETE FROM preview_controls WHERE key='lease' AND token=?").bind(token).run() }
}
