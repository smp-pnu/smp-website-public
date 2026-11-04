import { siteDate, siteStart, type SiteReport, type ReportAnalytics } from '../site-model'
export type RankingMetric = 'views' | 'downloads'
export type RankingQuery = { q: string; group: string; page: number; range: 1 | 7 | 30; metric: RankingMetric }
export const RANKING_PAGE_SIZE = 20
export function rankedReports(reports: SiteReport[], metric: RankingMetric) {
  const sorted = [...reports].sort((a,b) => (b[metric] ?? -1) - (a[metric] ?? -1) || a.title.localeCompare(b.title,'ko') || a.id.localeCompare(b.id))
  let rank: number | null = null
  return sorted.map((report,index) => {
    const value = report[metric]
    if (value === null || value === 0) rank = null
    else if (index === 0 || value !== sorted[index-1][metric]) rank = index+1
    return { ...report, rank }
  })
}
export function rankingPage(reports: SiteReport[], query: RankingQuery) {
  const term = query.q.trim().toLocaleLowerCase('ko')
  const all = rankedReports(reports,query.metric)
  const filtered = all.filter(r => (!term || [r.title,r.company,r.ticker].join(' ').toLocaleLowerCase('ko').includes(term)) && (!query.group || r.semester === query.group))
  const pages = Math.max(1,Math.ceil(filtered.length/RANKING_PAGE_SIZE)), page = Math.max(1,Math.min(query.page,pages))
  return { rows:filtered.slice((page-1)*RANKING_PAGE_SIZE,page*RANKING_PAGE_SIZE),total:filtered.length,pages,page }
}
export function reportInsights(reports: SiteReport[]) {
  const views = reports.reduce((n,r) => n+(r.views??0),0)
  const downloads = reports.reduce((n,r) => n+r.downloads,0)
  const active = reports.filter(r => (r.views??0)>0 || r.downloads>0).length
  const downloaded = reports.filter(r => r.downloads>0).length
  const top5 = [...reports].sort((a,b)=>(b.views??0)-(a.views??0)).slice(0,5).reduce((n,r)=>n+(r.views??0),0)
  const groups = new Map<string,{semester:string;views:number;downloads:number;count:number}>()
  for (const r of reports) {
    const key=r.semester||'학기 미지정',group=groups.get(key)??{semester:key,views:0,downloads:0,count:0}
    group.views+=r.views??0;group.downloads+=r.downloads;group.count++;groups.set(key,group)
  }
  return { views,downloads,active,downloaded,top5Share:views?top5/views*100:null,semesters:[...groups.values()].sort((a,b)=>b.views-a.views||b.downloads-a.downloads||b.semester.localeCompare(a.semester)) }
}
// Compare two *complete* weeks, not a partial today against seven full days.
export function weeklyComparison(data: ReportAnalytics) {
  const end=siteStart(data.checkedAt,1),start=end-14*86400000,middle=end-7*86400000
  const period=data.periods[30]
  const sum=(rows:{day:string;value:number}[],from:number,to:number)=>rows.filter(r=>r.day>=siteDate(from)&&r.day<siteDate(to)).reduce((n,r)=>n+r.value,0)
  const comparable=data.startedAt<=start
  const viewRows=(period.traffic?.daily??[]).map(d=>({day:d.day,value:d.views}))
  const downloadRows=period.dailyDownloads.map(d=>({day:d.day,value:d.count}))
  const views=comparable && !data.trafficError && data.trafficCheckedAt!==null && siteDate(data.trafficCheckedAt)===siteDate(data.checkedAt)
    ? {previous:sum(viewRows,start,middle),current:sum(viewRows,middle,end)} : null
  const downloads=comparable && !data.limitedDays.length ? {previous:sum(downloadRows,start,middle),current:sum(downloadRows,middle,end)} : null
  return {views,downloads,previousLabel:`${siteDate(start).slice(5)}–${siteDate(middle-86400000).slice(5)}`,currentLabel:`${siteDate(middle).slice(5)}–${siteDate(end-86400000).slice(5)}`}
}
