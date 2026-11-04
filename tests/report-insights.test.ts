import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rankedReports,rankingPage,reportInsights,weeklyComparison} from '../admin-lab/analytics/report-insights'
import {siteDate,siteStart,emptySitePeriod,type SiteReport,type ReportAnalytics} from '../admin-lab/site-model'
import {readAdminRoute,adminRouteHash} from '../admin-lab/admin-navigation'
const row=(id:number,views:number|null,downloads=0):SiteReport=>({id:id.toString(16).padStart(32,'0'),title:`리포트 ${id}`,views,downloads,failed:0,semester:id%2?'2026-2':'2026-1'})
test('rank ties are shared, zero/unknown are unranked, and filters retain overall position',()=>{
 const rows=[row(1,10),row(2,10),row(3,4),row(4,0),row(5,null,2)]
 assert.deepEqual(rankedReports(rows,'views').map(r=>r.rank),[1,1,3,null,null])
 const filtered=rankingPage(rows,{q:'리포트 3',group:'',range:7,metric:'views',page:999})
 assert.equal(filtered.page,1);assert.equal(filtered.rows[0].rank,3)
 assert.equal(rankedReports(rows,'downloads')[0].id,rows[4].id)
 const many=Array.from({length:51},(_,i)=>row(i,51-i))
 const last=rankingPage(many,{q:'',group:'',range:30,metric:'views',page:3})
 assert.equal(last.pages,3);assert.equal(last.rows.length,11);assert.equal(last.rows[0].rank,41)
 assert.equal(rankingPage(rows,{q:'없음',group:'',range:7,metric:'views',page:1}).total,0)
})
test('insights aggregate report activity and semester shares without dividing unknown or empty totals',()=>{
 const insight=reportInsights([row(1,10,2),row(2,0,3),row(3,null)])
 assert.equal(insight.views,10);assert.equal(insight.active,2);assert.equal(insight.downloaded,2);assert.equal(insight.top5Share,100)
 assert.equal(insight.semesters.find(s=>s.semester==='2026-1')?.downloads,3)
 assert.equal(reportInsights([]).top5Share,null)
})
test('week comparison excludes partial today, requires complete collection days, and hides missing periods',()=>{
 const now=Date.parse('2026-11-04T04:00:00Z'),end=siteStart(now,1)
 const daily=Array.from({length:15},(_,i)=>({day:siteDate(end-(14-i)*86400000),views:i===14?999:i<7?2:4,visits:1}))
 const p={...emptySitePeriod(),traffic:{visits:15,views:999,daily,reports:[],referrers:[]},dailyDownloads:daily.map(d=>({day:d.day,count:d.views}))}
 const data:ReportAnalytics={startedAt:end-14*86400000,checkedAt:now,trafficCheckedAt:now,trafficError:false,limitedDays:[],catalogSize:0,complete:{1:true,7:true,30:true},periods:{1:p,7:p,30:p}}
 assert.deepEqual(weeklyComparison(data).views,{previous:14,current:28})
 assert.deepEqual(weeklyComparison(data).downloads,{previous:14,current:28})
 assert.equal(weeklyComparison({...data,startedAt:data.startedAt+1}).views,null)
 assert.equal(weeklyComparison({...data,trafficError:true}).views,null)
 assert.equal(weeklyComparison({...data,limitedDays:['2026-10-28']}).downloads,null)
})
test('analytics deep links preserve metric, period, search, semester and page',()=>{
 const route=readAdminRoute('#analytics?metric=downloads&range=30&q=인바디&group=2026-2&page=3')
 assert.equal(route.section,'analytics');assert.equal(route.metric,'downloads');assert.equal(route.range,30)
 assert.deepEqual(readAdminRoute(adminRouteHash(route)),route)
 assert.equal(readAdminRoute('#analytics?range=999&metric=private').range,7)
 assert.equal(readAdminRoute('#analytics?range=999&metric=private').metric,'views')
})
