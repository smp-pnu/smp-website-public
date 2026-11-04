import type { Database } from '../cloudflare/bindings'
import { SITE_RANGES, REPORT_ANALYTICS_LIMIT, type SiteSnapshot, type ReportVisibility, type SiteReport, type ReportAnalytics } from '../admin-lab/site-model'

export async function readSiteAnalytics(db: Database): Promise<SiteSnapshot | null> {
  const row = await db.prepare('SELECT payload FROM cms_site_snapshot WHERE id=1').first<{ payload: string | null }>()
  return row?.payload ? JSON.parse(row.payload) : null
}
export const UNKNOWN_REPORT_TITLE = '제목을 확인할 수 없는 리포트'
export function knownReportTitle(title: string | undefined): string | undefined {
  return title && title !== UNKNOWN_REPORT_TITLE && title !== '현재 비공개 또는 삭제된 리포트' ? title : undefined
}
type Metadata = { id: string; title: string | null; visibility: ReportVisibility; semester: string | null; company: string | null; ticker: string | null }
const metadataColumns = `requested.id,
  COALESCE(json_extract(p.item,'$.title'),json_extract(e.approved,'$.item.title'),json_extract(e.draft,'$.item.title')) AS title,
  COALESCE(json_extract(p.item,'$.semester'),json_extract(e.draft,'$.item.semester')) AS semester,
  COALESCE(json_extract(p.item,'$.company'),json_extract(e.draft,'$.item.company')) AS company,
  COALESCE(json_extract(p.item,'$.ticker'),json_extract(e.draft,'$.item.ticker')) AS ticker,
  CASE WHEN e.trashed_at IS NOT NULL THEN 'trashed'
    WHEN e.id IS NOT NULL AND e.approved_revision IS NULL THEN 'private'
    WHEN p.id IS NOT NULL THEN 'public'
    WHEN e.id IS NOT NULL THEN 'private' ELSE 'missing' END AS visibility`
async function metadata(db: Database, ids: string[], limit: number, catalogue = false) {
  if (ids.length > limit) throw Error('Analytics report list exceeds its bounded size')
  const rows = await db.prepare(`WITH requested AS (SELECT value AS id FROM json_each(?)
    ${catalogue ? "UNION SELECT id FROM cms_entries WHERE kind='research' UNION SELECT id FROM free_content WHERE kind='research'" : ''})
    SELECT ${metadataColumns} FROM requested
    LEFT JOIN cms_entries e ON e.id=requested.id AND e.kind='research'
    LEFT JOIN free_content p ON p.id=requested.id AND p.kind='research'
    LIMIT ${limit + 1}`).bind(JSON.stringify(ids)).all<Metadata>()
  if (rows.results.length > limit) throw Error('Analytics catalogue exceeds its bounded size')
  return new Map(rows.results.map(row => [row.id, row]))
}
function describe(report: SiteReport, current?: Metadata): SiteReport {
  return { ...report, title: knownReportTitle(current?.title ?? undefined) ?? knownReportTitle(report.title) ?? UNKNOWN_REPORT_TITLE,
    visibility: current?.visibility ?? 'missing', semester: current?.semester ?? undefined,
    company: current?.company ?? undefined, ticker: current?.ticker ?? undefined }
}
// Hourly jobs can hydrate all measured reports; the overview still resolves <=60 IDs.
// Counters remain keyed by stable report ID. Neither path writes content or counts.
export async function currentReportDetails(db: Database, snapshot: SiteSnapshot, full = false): Promise<SiteSnapshot> {
  const ids = [...new Set(SITE_RANGES.flatMap(n => (full ? snapshot.periods?.[n]?.allReports ?? snapshot.periods?.[n]?.reports : snapshot.periods?.[n]?.reports)?.map(r => r.id) ?? []))]
  if (!ids.length) return snapshot
  const details = await metadata(db, ids, full ? REPORT_ANALYTICS_LIMIT : 60)
  const periods = { ...snapshot.periods }
  for (const n of SITE_RANGES) {
    if (!periods[n]) continue
    periods[n] = { ...periods[n], reports: periods[n].reports.map(r => describe(r, details.get(r.id))),
      ...(full && periods[n].allReports ? { allReports: periods[n].allReports!.map(r => describe(r, details.get(r.id))) } : {}) }
  }
  return { ...snapshot, periods }
}
export async function readSiteDashboard(db: Database): Promise<SiteSnapshot | null> {
  const stored = await readSiteAnalytics(db)
  if (!stored) return null
  const periods = { ...stored.periods }
  for (const n of SITE_RANGES) {
    const { allReports: _all, ...summary } = periods[n]
    periods[n] = { ...summary, traffic: summary.traffic ? { ...summary.traffic, reports: [] } : null }
  }
  return currentReportDetails(db, { ...stored, periods })
}
// Authenticated detail view: one stored snapshot + one bounded catalogue read.
// Filtering, sorting and pagination happen in the client, not on each click in D1.
export async function readReportAnalytics(db: Database): Promise<ReportAnalytics | null> {
  const snapshot = await readSiteAnalytics(db)
  if (!snapshot) return null
  if (SITE_RANGES.some(n => !snapshot.periods[n].allReports)) return null
  const ids = [...new Set(SITE_RANGES.flatMap(n => snapshot.periods[n].allReports!.map(r => r.id)))]
  const details = await metadata(db, ids, REPORT_ANALYTICS_LIMIT, true)
  const periods = { ...snapshot.periods }, complete = {} as ReportAnalytics['complete']
  for (const n of SITE_RANGES) {
    const { allReports, ...period } = periods[n]
    const measured = new Map((allReports ?? period.reports).map(r => [r.id, r]))
    complete[n] = !!allReports && period.traffic?.reportsComplete === true
    periods[n] = { ...period, traffic: period.traffic ? { ...period.traffic, reports: [] } : null,
      reports: [...details.values()].map(meta => describe(measured.get(meta.id) ?? {
        id: meta.id, title: UNKNOWN_REPORT_TITLE, views: complete[n] ? 0 : null,
        downloads: 0, failed: 0, started: 0, ready: 0, totalMs: 0,
      }, meta)) }
  }
  return { ...snapshot, periods, complete, catalogSize: details.size }
}
