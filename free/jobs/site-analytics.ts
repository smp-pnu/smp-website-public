import type {Database} from '../../cloudflare/bindings'
import {readSiteAnalytics} from '../../cms/site-analytics'
import {SITE_RANGES,siteDate,siteStart,emptySitePeriod,type Traffic,type SiteSnapshot,type SitePeriod,type SiteRange} from '../../admin-lab/site-model'

type Count={day:string;report:string;kind:string;bucket:number;count:number;total_ms:number}
const bounded=(n:unknown)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e12)throw Error('Invalid analytics');return n}
type Group={count:number;sum:{visits:number};dimensions?:{datetimeHour?:string;requestPath?:string;refererHost?:string}}
function groups(value:unknown,limit:number):Group[]{if(!Array.isArray(value)||value.length>=limit)throw Error('Incomplete analytics');return value}
export function parseTraffic(value:unknown):Traffic {
  const root=value as {errors?:unknown[];data?:{viewer?:{accounts?:{total:unknown;hours:unknown;reports:unknown;referrers:unknown}[]}}}
  if(root.errors?.length||root.data?.viewer?.accounts?.length!==1)throw Error('Analytics unavailable')
  const data=root.data.viewer.accounts[0],total=groups(data.total,2),hours=groups(data.hours,746),reports=groups(data.reports,101),refs=groups(data.referrers,21)
  const daily=new Map<string,{day:string;views:number;visits:number}>()
  for(const row of hours){const at=Date.parse(row.dimensions?.datetimeHour??'');if(!Number.isFinite(at))throw Error('Invalid analytics time');const day=siteDate(at),item=daily.get(day)??{day,views:0,visits:0};item.views+=bounded(row.count);item.visits+=bounded(row.sum.visits);daily.set(day,item)}
  const reportCounts=new Map<string,number>()
  for(const row of reports){const match=/^\/research\/([a-f\d-]{32,36})\/?$/.exec(row.dimensions?.requestPath??'');if(!match)continue;const id=match[1].replaceAll('-','');if(/^[a-f\d]{32}$/.test(id))reportCounts.set(id,(reportCounts.get(id)??0)+bounded(row.count))}
  return {views:total.length?bounded(total[0].count):0,visits:total.length?bounded(total[0].sum.visits):0,daily:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)),reports:[...reportCounts].map(([id,views])=>({id,views})),referrers:refs.map(r=>({host:String(r.dimensions?.refererHost??'').slice(0,253),visits:bounded(r.sum.visits)})).filter(r=>r.visits>0)}
}
export function combinePeriod(rows:Count[],traffic:Traffic|null,titles:Map<string,string>,start:string):SitePeriod {
  const out=emptySitePeriod();out.traffic=traffic
  const reports=new Map<string,SitePeriod['reports'][number]>(),daily=new Map<string,number>();let ms=0
  for(const r of traffic?.reports??[])reports.set(r.id,{id:r.id,title:titles.get(r.id)??'현재 비공개 또는 삭제된 리포트',views:r.views,downloads:0,failed:0})
  for(const row of rows){
    if(row.day<start)continue
    const report=reports.get(row.report)??{id:row.report,title:titles.get(row.report)??'현재 비공개 또는 삭제된 리포트',views:null,downloads:0,failed:0}
    if(row.kind==='download'){out.downloads+=row.count;report.downloads+=row.count;daily.set(row.day,(daily.get(row.day)??0)+row.count)}
    if(row.kind==='start')out.started+=row.count
    if(row.kind==='ready'){out.ready+=row.count;ms+=row.total_ms;if(row.bucket>=4)out.slow+=row.count}
    if(row.kind==='failed'){out.failed+=row.count;report.failed+=row.count}
    reports.set(row.report,report)
  }
  out.averageMs=out.ready?Math.round(ms/out.ready):null
  const all=[...reports.values()], popular=[...all].sort((a,b)=>(b.views??0)-(a.views??0)||b.downloads-a.downloads).slice(0,10), downloaded=[...all].sort((a,b)=>b.downloads-a.downloads).slice(0,10)
  out.reports=[...new Map([...popular,...downloaded].map(r=>[r.id,r])).values()]
  out.dailyDownloads=[...daily].map(([day,count])=>({day,count})).sort((a,b)=>a.day.localeCompare(b.day))
  return out
}
const QUERY=`query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){
 total:rumPageloadEventsAdaptiveGroups(limit:1,filter:{datetime_geq:$start,datetime_leq:$end,requestHost:"pnusmp.com",bot:0}){count sum{visits}}
 hours:rumPageloadEventsAdaptiveGroups(limit:745,filter:{datetime_geq:$start,datetime_leq:$end,requestHost:"pnusmp.com",bot:0}){dimensions{datetimeHour}count sum{visits}}
 reports:rumPageloadEventsAdaptiveGroups(limit:100,filter:{datetime_geq:$start,datetime_leq:$end,requestHost:"pnusmp.com",requestPath_like:"/research/%",bot:0},orderBy:[count_DESC]){dimensions{requestPath}count}
 referrers:rumPageloadEventsAdaptiveGroups(limit:20,filter:{datetime_geq:$start,datetime_leq:$end,requestHost:"pnusmp.com",bot:0},orderBy:[sum_visits_DESC]){dimensions{refererHost}sum{visits}}
}}}`
export async function collectSiteAnalytics(db:Database,config:{account:string;token:string},now=Date.now(),fetcher:typeof fetch=fetch){
  await db.prepare('INSERT OR IGNORE INTO cms_site_snapshot(id,started_at) VALUES(1,?)').bind(now).run()
  const lease=now+120000
  const claimed=await db.prepare('UPDATE cms_site_snapshot SET lease_until=?,refresh_after=? WHERE id=1 AND lease_until<=? AND refresh_after<=? RETURNING started_at').bind(lease,now+3600000,now,now).first<{started_at:number}>()
  if(!claimed)return {skipped:true,failed:false}
  const previous=await readSiteAnalytics(db),fresh=!!previous?.trafficCheckedAt&&now-previous.trafficCheckedAt<3600000&&siteDate(previous.trafficCheckedAt)===siteDate(now)
  let trafficError=previous?.trafficError??false,trafficAt=previous?.trafficCheckedAt??null
  const traffic={} as Record<SiteRange,Traffic|null>
  try {
    if(fresh){for(const n of SITE_RANGES)traffic[n]=previous!.periods[n].traffic}
    else {
      // Only aggregate public-host data, with recognized bots excluded. Never
      // query IPs, user agents, search strings or complete referrer URLs.
      for(const n of SITE_RANGES){
        const response=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({query:QUERY,variables:{account:config.account,start:new Date(Math.max(claimed.started_at,siteStart(now,n))).toISOString(),end:new Date(now).toISOString()}})})
        if(!response.ok){await response.body?.cancel();throw Error('Analytics unavailable')}
        traffic[n]=parseTraffic(await response.json())
      }
      trafficError=false;trafficAt=now
    }
  }catch{trafficError=true;for(const n of SITE_RANGES)traffic[n]=previous?.periods[n].traffic??null}
  const floor=siteDate(siteStart(now,30))
  await db.batch([
    db.prepare('DELETE FROM cms_site_receipts WHERE expires_at<?').bind(now),
    db.prepare('DELETE FROM cms_site_counts WHERE day<?').bind(floor),
    db.prepare('DELETE FROM cms_site_days WHERE day<?').bind(floor),
  ])
  const [counts,content,limited]=await Promise.all([
    db.prepare('SELECT * FROM cms_site_counts WHERE day>=? ORDER BY day').bind(floor).all<Count>(),
    db.prepare("SELECT id,json_extract(item,'$.title') title FROM free_content WHERE kind='research'").all<{id:string;title:string}>(),
    db.prepare('SELECT day FROM cms_site_days WHERE day>=? AND events>=2000 ORDER BY day').bind(floor).all<{day:string}>(),
  ])
  const titles=new Map(content.results.map(r=>[r.id,r.title])),periods={} as SiteSnapshot['periods']
  for(const n of SITE_RANGES)periods[n]=combinePeriod(counts.results,traffic[n],titles,siteDate(siteStart(now,n)))
  const snapshot:SiteSnapshot={startedAt:claimed.started_at,checkedAt:now,trafficCheckedAt:trafficAt,trafficError,limitedDays:limited.results.map(r=>r.day),periods}
  await db.prepare('UPDATE cms_site_snapshot SET payload=?,lease_until=0 WHERE id=1 AND lease_until=?').bind(JSON.stringify(snapshot),lease).run()
  return {skipped:false,failed:trafficError}
}
