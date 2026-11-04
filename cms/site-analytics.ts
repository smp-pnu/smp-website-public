import type {Database} from '../cloudflare/bindings'
import {SITE_RANGES,type SiteSnapshot,type ReportVisibility} from '../admin-lab/site-model'
export async function readSiteAnalytics(db:Database):Promise<SiteSnapshot|null> {
  const row=await db.prepare('SELECT payload FROM cms_site_snapshot WHERE id=1').first<{payload:string|null}>()
  return row?.payload?JSON.parse(row.payload):null
}

export const UNKNOWN_REPORT_TITLE = '제목을 확인할 수 없는 리포트'
export function knownReportTitle(title:string|undefined):string|undefined {
  return title && title !== UNKNOWN_REPORT_TITLE && title !== '현재 비공개 또는 삭제된 리포트' ? title : undefined
}

// Counters stay keyed by the stable report ID. Visibility only changes metadata
// and whether the dashboard can offer a working public link, never the totals.
export async function currentReportDetails(db:Database,snapshot:SiteSnapshot):Promise<SiteSnapshot> {
  // Each of three periods contains at most two top-ten lists: <= 60 indexed IDs.
  const ids=[...new Set(SITE_RANGES.flatMap(n=>snapshot.periods?.[n]?.reports.map(r=>r.id)??[]))]
  if(!ids.length)return snapshot
  if(ids.length>60)throw Error('Analytics report list exceeds its bounded size')
  const rows=await db.prepare(`WITH requested AS (SELECT value AS id FROM json_each(?))
    SELECT requested.id,
      COALESCE(json_extract(p.item,'$.title'),json_extract(e.approved,'$.item.title'),json_extract(e.draft,'$.item.title')) AS title,
      CASE WHEN e.trashed_at IS NOT NULL THEN 'trashed'
        WHEN e.id IS NOT NULL AND e.approved_revision IS NULL THEN 'private'
        WHEN p.id IS NOT NULL THEN 'public'
        WHEN e.id IS NOT NULL THEN 'private' ELSE 'missing' END AS visibility
    FROM requested
    LEFT JOIN cms_entries e ON e.id=requested.id AND e.kind='research'
    LEFT JOIN free_content p ON p.id=requested.id AND p.kind='research'`)
    .bind(JSON.stringify(ids)).all<{id:string;title:string|null;visibility:ReportVisibility}>()
  const details=new Map(rows.results.map(row=>[row.id,row]))
  const periods={...snapshot.periods}
  for(const n of SITE_RANGES){
    if(!periods[n])continue
    periods[n]={...periods[n],reports:periods[n].reports.map(report=>{
      const current=details.get(report.id)
      return {...report,title:knownReportTitle(current?.title??undefined)??knownReportTitle(report.title)??UNKNOWN_REPORT_TITLE,visibility:current?.visibility??'missing'}
    })}
  }
  return {...snapshot,periods}
}

// Used only behind administrator authentication. Refreshing labels is a bounded
// read, independent of hourly Cloudflare collection and without an external call.
export async function readSiteDashboard(db:Database):Promise<SiteSnapshot|null> {
  const snapshot=await readSiteAnalytics(db)
  return snapshot?currentReportDetails(db,snapshot):null
}
