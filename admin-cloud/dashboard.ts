import type { Database } from "../cloudflare/bindings"
import type { ContentCount, DashboardData, DriveCapacity } from "../admin-lab/dashboard-model"
import { limits } from "../admin-lab/model"
import { cmsLimits } from "../cms/model"
import { metadataDailyLimit } from "./ai-metadata"
import { storageBytesSql } from "./report-versions"
import { DriveConnection, validFileId } from "./drive/connection"
import { dashboardSnapshot } from "./dashboard-cache"
import { adminDailyRequests, driveDailyUploads } from "./operation-limits"

export async function dashboardData(admin: Database, cms: Database, now = Date.now()): Promise<DashboardData> {
  const day = Math.floor(now / 86400000)
  const [counts, storage, originals, files, jobs, local, usage] = await Promise.all([
    cms.prepare(`SELECT kind,count(*) AS total,
      sum(trashed_at IS NULL AND approved_revision IS NOT NULL) AS published,
      sum(trashed_at IS NULL AND approved_revision IS NULL) AS drafts,
      sum(trashed_at IS NULL AND approved_revision IS NOT NULL AND revision<>approved_revision) AS changed,
      sum(trashed_at IS NOT NULL) AS trash FROM cms_entries GROUP BY kind`).all<ContentCount>(),
    cms.prepare(`SELECT (SELECT coalesce(sum(bytes),0) FROM cms_assets) AS assetsBytes,
      (SELECT bytes FROM cms_metadata_budget WHERE id=1) AS metadataBytes,
      (SELECT count(*) FROM cms_entries) AS entries,
      (SELECT count(*) FROM cms_entries WHERE kind='research' AND json_extract(draft,'$.upload.id') IS NULL) AS legacyReports`).first<{assetsBytes:number;metadataBytes:number;entries:number;legacyReports:number}>(),
    admin.prepare(`SELECT count(*) AS count,coalesce(sum(CASE WHEN provider='drive' THEN pdf_bytes ELSE 0 END),0) AS driveBytes,
      coalesce(sum(CASE WHEN provider='d1' THEN pdf_bytes ELSE 0 END),0) AS databaseBytes,
      coalesce(sum(CASE WHEN NOT EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=f.id) THEN pdf_bytes ELSE 0 END),0) AS retainedBytes
      FROM report_files f WHERE state<>'deleted'`).first<{count:number;driveBytes:number;databaseBytes:number;retainedBytes:number}>(),
    admin.prepare(`SELECT coalesce((SELECT json_extract(o.data,'$.filename') FROM objects o JOIN report_file_bindings b ON b.report_id=o.id WHERE b.asset_id=f.id LIMIT 1),
      (SELECT json_extract(v.data,'$.filename') FROM report_versions v WHERE v.asset_id=f.id LIMIT 1),'이전 PDF 원본') AS name,
      pdf_bytes AS bytes,provider,NOT EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=f.id) AS retained
      FROM report_files f WHERE state<>'deleted' ORDER BY pdf_bytes DESC,f.id LIMIT 10`).all<DashboardData['files'][number]>(),
    cms.prepare("SELECT count(*) AS pending,coalesce(sum(error IS NOT NULL),0) AS failed FROM cms_jobs").first<{pending:number;failed:number}>(),
    admin.prepare(`SELECT ${storageBytesSql} AS adminBytes,
      (SELECT count(*) FROM objects WHERE status='staging') AS staging,
      (SELECT count(*) FROM report_files WHERE state='pending-delete')+(SELECT count(*) FROM abandoned_drive_files) AS cleanup,
      (SELECT count(*) FROM report_files WHERE state='pending-delete' AND last_error IS NOT NULL)+(SELECT count(*) FROM abandoned_drive_files WHERE last_error IS NOT NULL) AS cleanupFailed`).first<{adminBytes:number;staging:number;cleanup:number;cleanupFailed:number}>(),
    admin.prepare("SELECT key,hits FROM usage WHERE key IN (?,?,?)").bind(`day:${day}`,`drive-new:${day}`,`metadata-day:${day}`).all<{key:string;hits:number}>(),
  ])
  if (!storage || !originals || !jobs || !local) throw Error("Dashboard aggregate unavailable")
  const hits = new Map(usage.results.map(v=>[v.key,v.hits]))
  return {
    content: (['research','notice','members'] as const).map(kind=>counts.results.find(v=>v.kind===kind) ?? {kind,total:0,published:0,drafts:0,changed:0,trash:0}),
    storage: { adminBytes:local.adminBytes,adminLimit:limits.totalBytes,assetsBytes:storage.assetsBytes,assetsLimit:cmsLimits.assetsBytes,
      metadataBytes:storage.metadataBytes,metadataLimit:64*1024*1024,entries:storage.entries,entryLimit:cmsLimits.entries },
    originals: {...originals,legacyReports:storage.legacyReports,staging:local.staging}, files: files.results,
    jobs: {...jobs,cleanup:local.cleanup,cleanupFailed:local.cleanupFailed},
    daily: {requests:hits.get(`day:${day}`)??0,requestsLimit:adminDailyRequests,uploads:hits.get(`drive-new:${day}`)??0,uploadsLimit:driveDailyUploads,
      ai:hits.get(`metadata-day:${day}`)??0,aiLimit:metadataDailyLimit,resetsAt:(day+1)*86400000},
  }
}
export async function driveCapacity(connection: DriveConnection, reportsFolderId?: string) {
  const snapshot = await dashboardSnapshot<DriveCapacity>(connection.env.ADMIN_DB,"drive",600_000,async()=>{
    const grant = await connection.grant()
    if (!grant?.folderId) return {connected:false,email:null,folderUrl:null,quota:null}
    return { connected:true,email:grant.email,folderUrl:null,quota:await connection.quotaDetails() }
  },connection.now)
  // The archive shortcut is independent of the app-owned upload destination.
  // Apply it after reading the quota cache so old snapshots cannot restore the trial link.
  const folderUrl = reportsFolderId && validFileId(reportsFolderId)
    ? `https://drive.google.com/drive/folders/${reportsFolderId}` : null
  return {...snapshot,value:snapshot.value?{...snapshot.value,folderUrl}:null}
}
