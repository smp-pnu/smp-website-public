import type {Database} from "../../cloudflare/bindings"
import {CLOUD_USAGE_SCHEMA,readCloudUsage} from "../../cms/cloudflare-usage"
import {CLOUD_INTERVAL,cloudDay,type CloudPart,type CloudUsage,type CloudWorkers,type CloudRows,type CloudStorage} from "../../admin-lab/cloudflare-model"

type Fetch = typeof fetch
type RecordData = Record<string,unknown>
function object(value:unknown):RecordData {
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("Invalid metrics response")
  return value as RecordData
}
function list(value:unknown,max=100):unknown[] {
  if(!Array.isArray(value) || value.length>=max)throw Error("Incomplete metrics response")
  return value
}
function number(value:unknown):number {
  if(typeof value!=="number" || !Number.isFinite(value) || value<0 || value>Number.MAX_SAFE_INTEGER)throw Error("Invalid metric")
  return value
}
function name(value:unknown) {
  if(typeof value!=="string" || !value || value.length>128)throw Error("Invalid metric name")
  return value
}
// The API's cpuTimeP* fields use microseconds. Keep the API conversion here,
// separate from the UI and from the per-request limit expressed in ms.
function cpu(value:unknown) {return value===null ? null : number(value)/1000}
function account(data:unknown) {
  const root=object(data)
  if(root.errors && (!Array.isArray(root.errors)||root.errors.length))throw Error("Analytics unavailable")
  const accounts=object(object(root.data).viewer).accounts
  if(!Array.isArray(accounts)||accounts.length!==1)throw Error("Analytics account missing")
  return object(accounts[0])
}
export function parseWorkers(data:unknown,start:number,end:number):CloudWorkers {
  const result=account(data),seen=new Set<string>()
  const scripts=list(result.workers).map(value=>{
    const row=object(value),sum=object(row.sum),q=object(row.quantiles),script=name(object(row.dimensions).scriptName)
    if(seen.has(script))throw Error("Duplicate Worker group");seen.add(script)
    return {name:script,requests:number(sum.requests),errors:number(sum.errors),p50Ms:cpu(q.cpuTimeP50),p99Ms:cpu(q.cpuTimeP99)}
  })
  const statuses=list(result.status),resourceErrors=statuses.reduce<number>((total,value)=>{
    const row=object(value),status=name(object(row.dimensions).status),requests=number(object(row.sum).requests)
    return total+(['exceededResources','exceededCpu','exceededMemory'].includes(status)?requests:0)
  },0)
  return {start,end,scripts,requests:scripts.reduce((n,s)=>n+s.requests,0),errors:scripts.reduce((n,s)=>n+s.errors,0),resourceErrors}
}
export function parseRows(data:unknown,start:number,end:number):CloudRows {
  const groups=list(account(data).d1)
  return groups.reduce<CloudRows>((total,value)=>{
    const sum=object(object(value).sum)
    total.read+=number(sum.rowsRead);total.written+=number(sum.rowsWritten);return total
  },{start,end,read:0,written:0})
}
export function parseStorage(data:unknown):CloudStorage {
  const root=object(data)
  if(root.success!==true)throw Error("Storage unavailable")
  const results=list(root.result),info=object(root.result_info)
  if(number(info.total_count)!==results.length)throw Error("Incomplete database list")
  const databases=results.map(value=>{const row=object(value);return {name:name(row.name),bytes:number(row.file_size)}}).sort((a,b)=>b.bytes-a.bytes)
  return {databases,bytes:databases.reduce((n,d)=>n+d.bytes,0)}
}
const WORKERS = `query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){
 workers:workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$start,datetime_leq:$end},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors}quantiles{cpuTimeP50 cpuTimeP99}}
 status:workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$start,datetime_leq:$end}){dimensions{status}sum{requests}}
}}}`
const ROWS = `query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){
 d1:d1AnalyticsAdaptiveGroups(limit:100,filter:{datetime_geq:$start,datetime_leq:$end}){sum{rowsRead rowsWritten}}
}}}`
export async function collectCloudUsage(db:Database,config:{account:string;token:string},now=Date.now(),fetcher:Fetch=fetch) {
  if(!/^[a-f0-9]{32}$/.test(config.account)||!config.token)throw Error("Cloud metrics configuration missing")
  await db.prepare(CLOUD_USAGE_SCHEMA).run()
  await db.prepare("INSERT OR IGNORE INTO cms_cloud_usage(id) VALUES(1)").run()
  const lease=now+120_000
  const claimed=await db.prepare("UPDATE cms_cloud_usage SET lease_until=?,refresh_after=? WHERE id=1 AND lease_until<=? AND refresh_after<=? RETURNING id")
    .bind(lease,now+CLOUD_INTERVAL,now,now).first()
  if(!claimed)return {skipped:true,failed:0}
  const current=await readCloudUsage(db),start=cloudDay(now)
  async function request(path:string,query?:string) {
    const response=await fetcher(`https://api.cloudflare.com/client/v4/${path}`,{
      method:query?"POST":"GET",redirect:"error",signal:AbortSignal.timeout(20_000),
      headers:{Authorization:`Bearer ${config.token}`,"Content-Type":"application/json"},
      body:query?JSON.stringify({query,variables:{account:config.account,start:new Date(start).toISOString(),end:new Date(now).toISOString()}}):undefined,
    })
    if(!response.ok){await response.body?.cancel();throw Error("Cloud metrics unavailable")}
    return response.json() as Promise<unknown>
  }
  async function part<T>(previous:CloudPart<T>,load:()=>Promise<T>):Promise<CloudPart<T>> {
    try{return {value:await load(),checkedAt:now,error:false}}
    catch{return {...previous,error:true}}
  }
  // Bounded API calls; no retries, raw errors, request logs or user content.
  const [workers,rows,storage]=await Promise.all([
    part(current.workers,async()=>parseWorkers(await request('graphql',WORKERS),start,now)),
    part(current.rows,async()=>parseRows(await request('graphql',ROWS),start,now)),
    part(current.storage,async()=>parseStorage(await request(`accounts/${config.account}/d1/database?per_page=100`))),
  ])
  const snapshot:CloudUsage={workers,rows,storage}
  await db.prepare("UPDATE cms_cloud_usage SET payload=?,lease_until=0 WHERE id=1 AND lease_until=?").bind(JSON.stringify(snapshot),lease).run()
  return {skipped:false,failed:[workers,rows,storage].filter(p=>p.error).length}
}
