import type {Env} from './types'
import type {SiteEvent} from '../../lib/site-events'

export const SITE_EVENT_LIMIT=2000
export function siteDay(now:number){return new Date(now+9*3600000).toISOString().slice(0,10)}
export function validateEvents(value:unknown):SiteEvent[]|null {
  if(!value||typeof value!=='object'||Object.keys(value).join()!=='events')return null
  const events=(value as {events:unknown}).events
  if(!Array.isArray(events)||!events.length||events.length>8)return null
  const ids=new Set<string>()
  for(const e of events){
    if(!e||typeof e!=='object'||Object.keys(e).sort().join()!=='id,kind,ms,report'||!['download','start','ready','failed'].includes(e.kind)||!Number.isSafeInteger(e.ms)||e.ms<0||e.ms>600000)return null
    if(!/^[a-f0-9]{32}$/.test(e.report)||typeof e.id!=='string'||!new RegExp(`^[a-f0-9]{32}:${e.kind==='ready'||e.kind==='failed'?'result':e.kind}$`).test(e.id)||ids.has(e.id))return null
    if((e.kind==='download'||e.kind==='start')&&e.ms!==0)return null
    ids.add(e.id)
  }
  return events
}
export async function recordEvents(env:Env,events:SiteEvent[],now:number) {
  const day=siteDay(now),budgetDay=new Date(now).toISOString().slice(0,10)
  // Triggers enforce the global daily cap and update aggregates in the same
  // atomic insert. Replays, races and unknown/private reports cannot add counts.
  await env.CMS_DB.batch(events.map(e=>env.CMS_DB.prepare(`INSERT OR IGNORE INTO cms_site_receipts(id,day,budget_day,report,kind,bucket,ms,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM free_content WHERE id=? AND kind='research')
    AND EXISTS(SELECT 1 FROM cms_site_snapshot WHERE id=1 AND json_extract(payload,'$.checkedAt')>=?)`)
    .bind(e.id,day,budgetDay,e.report,e.kind,[1000,3000,5000,10000,30000,60000,120000,600000].findIndex(n=>e.ms<=n),e.ms,now+2*86400000,e.report,now-2*86400000)))
}
export async function siteEvents(request:Request,env:Env,now=Date.now()) {
  const empty=()=>new Response(null,{status:204})
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}})
  const origin=new URL(request.url).origin
  if(origin!=='https://pnusmp.com'||request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')!=='same-origin'||!request.headers.get('content-type')?.startsWith('application/json'))return empty()
  if(/bot|crawler|spider|headless/i.test(request.headers.get('user-agent')??'')||request.headers.get('dnt')==='1')return empty()
  if(Number(request.headers.get('content-length')??0)>4096)return empty()
  if(env.SITE_EVENT_RATE_LIMIT&&!(await env.SITE_EVENT_RATE_LIMIT.limit({key:request.headers.get('cf-connecting-ip')??'unknown'})).success)return empty()
  try {
    const reader=request.body?.getReader();if(!reader)return empty()
    const chunks:Uint8Array[]=[];let size=0
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return empty()}chunks.push(value)}}finally{reader.releaseLock()}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
    const events=validateEvents(JSON.parse(new TextDecoder().decode(bytes)))
    if(events)await recordEvents(env,events,now)
  }catch{/* Measurement failure is deliberately invisible to the public site. */}
  return empty()
}
