import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import type {Database,Statement} from '../cloudflare/bindings'
import {validateEvents,recordEvents,siteEvents,SITE_EVENT_LIMIT} from '../free/server/site-events'
import {collectSiteAnalytics,parseTraffic,combinePeriod} from '../free/jobs/site-analytics'
import {siteStart,siteDate,emptySitePeriod,type SiteSnapshot} from '../admin-lab/site-model'
import {readSiteAnalytics,readSiteDashboard,currentReportDetails,readReportAnalytics,UNKNOWN_REPORT_TITLE} from '../cms/site-analytics'
import type {Env} from '../free/server/types'
import {publicReportId,type SiteEvent} from '../lib/site-events'
const report='a'.repeat(32),now=Date.parse('2026-10-28T05:00:00Z')
const event=(n:number,kind:SiteEvent['kind']='download'):SiteEvent=>({id:`${n.toString(16).padStart(32,'0')}:${kind==='ready'||kind==='failed'?'result':kind}`,report,kind,ms:kind==='ready'?1500:0})
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cms/schema.sql','utf8'));sql.exec(readFileSync('cms/budget.sql','utf8'));sql.exec('CREATE TABLE free_content(id TEXT PRIMARY KEY,kind TEXT,item TEXT)');sql.prepare('INSERT INTO free_content VALUES(?,?,?)').run(report,'research',JSON.stringify({title:'테스트 기업'}));sql.prepare('INSERT INTO cms_site_snapshot(id,started_at,payload) VALUES(1,?,?)').run(now,JSON.stringify({checkedAt:now}));
 const prepare=(q:string,v:unknown[]=[]):Statement=>({bind:(...x)=>prepare(q,x),async first<T>(){return (sql.prepare(q).get(...v as never[])??null) as T|null},async all<T>(){return {results:sql.prepare(q).all(...v as never[]) as T[]}},async run(){return sql.prepare(q).run(...v as never[])}})
 const db:Database={prepare,async batch(v){sql.exec('BEGIN');try{const result=[];for(const q of v)result.push(await q.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}}
 const env:Env={CMS_DB:db,ASSETS:{fetch}}
 return {sql,db,env}
}
const graph={data:{viewer:{accounts:[{latest:[{count:1,dimensions:{datetimeMinute:'2026-10-28T04:32:00Z'}}],total:[{count:8,sum:{visits:3}}],hours:[{count:8,sum:{visits:3},dimensions:{datetimeHour:'2026-10-27T16:00:00Z'}}],reports:[{count:5,dimensions:{requestPath:'/research/'+report}}],referrers:[{sum:{visits:3},dimensions:{refererHost:'google.com'}}]}]}},errors:null}
test('analytics accepts only bounded anonymous report events, rejects extra sensitive fields and malformed IDs',()=>{
 assert.deepEqual(validateEvents({events:[event(1)]}),[event(1)])
 for(const body of [{events:[]},{events:Array(9).fill(event(1))},{events:[event(1),event(1)]},{events:[{...event(1),email:'private'}]},{events:[{...event(1),ms:Infinity}]},{events:[{...event(1),kind:'pageview'}]},{events:[{...event(1),id:'id'}]},{events:[{...event(1),report:'https://private'}]}])assert.equal(validateEvents(body),null)
 assert.equal(publicReportId('/api/content/research/'+report+'/pdf?download=1'),report)
 assert.equal(publicReportId('https://other.test/api/content/research/'+report+'/pdf'),null)
 assert.equal(publicReportId('/api/content/notice/'+report+'/pdf'),null)
})
test('events are deduplicated atomically and a PDF attempt cannot be both success and failure',async()=>{
 const {sql,env}=fixture()
 try{await recordEvents(env,[event(1,'start'),event(1,'ready'),event(1,'failed'),event(2)],now);await recordEvents(env,[event(2)],now)
 assert.equal(sql.prepare('SELECT events FROM cms_site_days').get()?.events,3)
 assert.equal(sql.prepare("SELECT count(*) n FROM cms_site_counts WHERE kind='failed'").get()?.n,0)
 assert.equal(sql.prepare("SELECT count FROM cms_site_counts WHERE kind='download'").get()?.count,1)
 await recordEvents(env,[{...event(3),report:'b'.repeat(32)}],now)
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,3)
 }finally{sql.close()}
})
test('global event cap is enforced even in a batch; next UTC day resumes and stale cleanup stops collection',async()=>{
 const {sql,env}=fixture()
 try{sql.prepare('INSERT INTO cms_site_days VALUES(?,?)').run('2026-10-28',SITE_EVENT_LIMIT-1)
 await recordEvents(env,[event(1),event(2)],now)
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,1)
 await recordEvents(env,[event(2)],now+86400000);assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,2)
 await recordEvents(env,[event(3)],now+3*86400000);assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,2)
 }finally{sql.close()}
})
test('cross-origin, bots, oversized, malformed and rate-limited requests cannot write; errors never break visitors',async()=>{
 const {sql,env}=fixture(),url='https://pnusmp.com/api/site-events'
 const headers={'Origin':'https://pnusmp.com','Sec-Fetch-Site':'same-origin','Content-Type':'application/json','User-Agent':'Browser'}
 try{
 for(const bad of [{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{'User-Agent':'Googlebot'},{'Content-Type':'text/plain'},{DNT:'1'}] as Record<string,string>[])assert.equal((await siteEvents(new Request(url,{method:'POST',headers:{...headers,...bad},body:JSON.stringify({events:[event(1)]})}),env,now)).status,204)
 assert.equal((await siteEvents(new Request(url,{method:'POST',headers,body:' '.repeat(5000)}),env,now)).status,204)
 await siteEvents(new Request(url,{method:'POST',headers,body:JSON.stringify({events:[event(1)]})}),{...env,SITE_EVENT_RATE_LIMIT:{async limit(){return {success:false}}}},now)
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,0)
 await siteEvents(new Request(url,{method:'POST',headers,body:JSON.stringify({events:[event(1)]})}),env,now)
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,1)
 assert.equal((await siteEvents(new Request(url),env,now)).status,405)
 }finally{sql.close()}
})
test('traffic uses KST days, validates missing/error responses, and distinguishes complete zero counts from unavailable measurements',()=>{
 const traffic=parseTraffic(graph);assert.equal(traffic.daily[0].day,'2026-10-28');assert.equal(traffic.visits,3);assert.equal(traffic.lastViewAt,Date.parse('2026-10-28T04:32:00Z'))
 assert.throws(()=>parseTraffic({errors:[{message:'denied'}]}));assert.throws(()=>parseTraffic({data:{viewer:{accounts:[{}]}}}))
 assert.equal(siteDate(siteStart(now,7)),'2026-10-22')
 const p=combinePeriod([{day:'2026-10-28',report:'b'.repeat(32),kind:'download',bucket:0,count:2,total_ms:0},{day:'2026-10-28',report,kind:'ready',bucket:4,count:2,total_ms:22000}],traffic,new Map([[report,'기업']]),'2026-10-28')
 assert.equal(p.downloads,2);assert.equal(p.averageMs,11000);assert.equal(p.slow,2);assert.equal(p.reports.find(r=>r.id==='b'.repeat(32))?.views,0)
})
test('private collector throttles, keeps previous traffic on errors, purges retention, and stores no credentials',async()=>{
 const {sql,db,env}=fixture();sql.prepare('UPDATE cms_site_snapshot SET payload=NULL').run();let calls=0
 const fake:typeof fetch=async(_url,init)=>{calls++;const req=JSON.parse(String(init?.body));assert.ok(Date.parse(req.variables.start)>=now);return Response.json(graph)}
 try{
 await recordEvents(env,[event(1)],now) // not enabled before first collection
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,0)
 await collectSiteAnalytics(db,{account:'a'.repeat(32),token:'SECRET'},now,fake);assert.equal(calls,3)
 await recordEvents(env,[event(2)],now)
 assert.equal((await collectSiteAnalytics(db,{account:'a'.repeat(32),token:'SECRET'},now+1000,fake)).skipped,true)
 await collectSiteAnalytics(db,{account:'a'.repeat(32),token:'SECRET'},now+61*60000,fake);assert.equal(calls,6)
 assert.equal((await readSiteAnalytics(db))?.periods[7].downloads,1);assert.equal((await readSiteAnalytics(db))?.periods[7].lastDownloadAt,now)
 await collectSiteAnalytics(db,{account:'a'.repeat(32),token:'SECRET'},now+122*60000,async()=>Response.json({errors:[{message:'SECRET_ERROR'}]}))
 const snapshot=await readSiteAnalytics(db);assert.equal(snapshot?.trafficError,true);assert.equal(snapshot?.trafficCheckedAt,now+61*60000);assert.equal(snapshot?.periods[7].traffic?.visits,3)
 assert.ok(!JSON.stringify(snapshot).includes('SECRET'))
 await collectSiteAnalytics(db,{account:'a'.repeat(32),token:'SECRET'},now+3*86400000,async()=>Response.json(graph))
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,0)
 assert.equal((await readSiteAnalytics(db))?.periods[7].lastDownloadAt,now)
 assert.equal((await readSiteAnalytics(db))?.periods[1].lastDownloadAt,null)
 await collectSiteAnalytics(db,{account:'a'.repeat(32),token:'SECRET'},now+32*86400000,async()=>Response.json(graph))
 assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_receipts').get()?.n,0);assert.equal(sql.prepare('SELECT count(*) n FROM cms_site_counts').get()?.n,0);assert.equal((await readSiteAnalytics(db))?.periods[30].lastDownloadAt,null)
 }finally{sql.close()}
})

test('dashboard repairs stale report labels immediately without changing counts, collection times or stored snapshots',async()=>{
 const {sql,db}=fixture()
 try{
  const period={...emptySitePeriod(),downloads:7,reports:[{id:report,title:'현재 비공개 또는 삭제된 리포트',views:12,downloads:7,failed:0}]}
  const snapshot:SiteSnapshot={startedAt:now,checkedAt:now,trafficCheckedAt:now,trafficError:false,limitedDays:[],periods:{1:period,7:period,30:period}}
  const original=JSON.stringify(snapshot)
  sql.prepare('UPDATE cms_site_snapshot SET payload=?').run(original)
  const repaired=await readSiteDashboard(db)
  assert.equal(repaired?.periods[7].reports[0].title,'테스트 기업')
  assert.equal(repaired?.periods[7].reports[0].visibility,'public')
  assert.equal(repaired?.periods[7].reports[0].views,12)
  assert.equal(repaired?.periods[7].downloads,7)
  assert.equal(repaired?.checkedAt,now)
  assert.equal(sql.prepare('SELECT payload FROM cms_site_snapshot').get()?.payload,original)
  sql.prepare('DELETE FROM free_content').run()
  const missing=await currentReportDetails(db,repaired!)
  assert.equal(missing.periods[7].reports[0].title,'테스트 기업','keep a known historical title for removed records')
  assert.equal(missing.periods[7].reports[0].visibility,'missing','do not offer a broken public link')
  const unknown=await currentReportDetails(db,snapshot)
  assert.equal(unknown.periods[7].reports[0].title,UNKNOWN_REPORT_TITLE)
 }finally{sql.close()}
})

test('metadata refresh looks up only ranked IDs in one bounded query',async()=>{
 const {sql,db}=fixture()
 try{
  const make=(offset:number)=>({...emptySitePeriod(),reports:Array.from({length:20},(_,i)=>({id:(offset+i).toString(16).padStart(32,'0'),title:'기존 제목',views:1,downloads:0,failed:0}))})
  const snapshot:SiteSnapshot={startedAt:now,checkedAt:now,trafficCheckedAt:now,trafficError:false,limitedDays:[],periods:{1:make(0),7:make(20),30:make(40)}}
  let queries=0
  const bounded:Database={...db,prepare(query){queries++;assert.ok(query.includes('json_each(?)'));return db.prepare(query)}}
  await currentReportDetails(bounded,snapshot)
  assert.equal(queries,1)
  snapshot.periods[30].reports.push({id:'f'.repeat(32),title:'초과',views:1,downloads:0,failed:0})
  await assert.rejects(()=>currentReportDetails(bounded,snapshot),/bounded size/)
  assert.equal(queries,1)
 }finally{sql.close()}
})

test('full report analytics retains ranks beyond ten, includes unviewed catalogue, and keeps overview light',async()=>{
 const {sql,db}=fixture()
 try{
  const paths=Array.from({length:45},(_,i)=>({count:45-i,dimensions:{requestPath:'/research/'+(i+1).toString(16).padStart(32,'0')}}))
  for(const row of paths)sql.prepare('INSERT INTO free_content VALUES(?,?,?)').run(row.dimensions.requestPath.split('/').at(-1)!,'research',JSON.stringify({title:'기업 '+row.count,semester:'2026-2'}))
  const traffic=parseTraffic({data:{viewer:{accounts:[{...graph.data.viewer.accounts[0],reports:paths}]}}})
  const p=combinePeriod([{day:siteDate(now),report,kind:'download',bucket:0,count:3,total_ms:0}],traffic,new Map(),siteDate(siteStart(now,30)))
  assert.equal(p.allReports?.length,46)
  assert.ok(p.reports.length<=20)
  const snapshot=await currentReportDetails(db,{startedAt:now,checkedAt:now,trafficCheckedAt:now,trafficError:false,limitedDays:[],periods:{1:p,7:p,30:p}},true)
  sql.prepare('UPDATE cms_site_snapshot SET payload=?').run(JSON.stringify(snapshot))
  const full=await readReportAnalytics(db)
  assert.equal(full?.catalogSize,46);assert.equal(full?.complete[7],true)
  assert.equal(full?.periods[7].reports.find(r=>r.id===report)?.views,0)
  assert.equal(full?.periods[7].reports.find(r=>r.id==='0000000000000000000000000000002d')?.views,1)
  assert.equal(full?.periods[7].downloads,3)
  const compact=await readSiteDashboard(db)
  assert.equal(compact?.periods[7].allReports,undefined)
  assert.deepEqual(compact?.periods[7].traffic?.reports,[])
  assert.equal(compact?.periods[7].downloads,3)
  sql.prepare('UPDATE cms_site_snapshot SET payload=?').run(JSON.stringify({...snapshot,periods:{1:{...p,allReports:undefined},7:p,30:p}}))
  assert.equal(await readReportAnalytics(db),null,'legacy top-ten snapshots must not pretend to be complete rankings')
 }finally{sql.close()}
})
test('truncated Cloudflare report lists fail closed, without silently presenting a partial overall rank',()=>{
 const data=structuredClone(graph)
 data.data.viewer.accounts[0].reports=Array.from({length:1001},()=>({count:1,dimensions:{requestPath:'/research/'+report}}))
 assert.throws(()=>parseTraffic(data),/Incomplete/)
 const traffic=parseTraffic(graph)
 const p=combinePeriod([{day:siteDate(now),report,kind:'start',bucket:0,count:5,total_ms:0},{day:siteDate(now),report,kind:'ready',bucket:1,count:3,total_ms:6000},{day:siteDate(now),report,kind:'failed',bucket:0,count:1,total_ms:0}],traffic,new Map(),siteDate(now))
 assert.equal(p.allReports?.[0].started,5);assert.equal(p.allReports?.[0].ready,3);assert.equal(p.allReports?.[0].failed,1);assert.equal(p.allReports?.[0].totalMs,6000)
})
