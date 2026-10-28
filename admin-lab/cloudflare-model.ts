// Free-plan reference limits, checked against Cloudflare's official docs.
// CPU is a per-invocation budget, never a daily cumulative allowance.
export const CLOUD_FREE = {requests:100_000,cpuMs:10,rowsRead:5_000_000,rowsWritten:100_000,databaseBytes:500*1024**2,storageBytes:5*1024**3} as const
export const CLOUD_INTERVAL = 15*60_000
export type CloudPart<T> = {value:T|null;checkedAt:number|null;error:boolean}
export type CloudWorkers = {
  start:number;end:number;requests:number;errors:number;resourceErrors:number
  scripts:{name:string;requests:number;errors:number;p50Ms:number|null;p99Ms:number|null}[]
}
export type CloudRows = {start:number;end:number;read:number;written:number}
export type CloudStorage = {bytes:number;databases:{name:string;bytes:number}[]}
export type CloudUsage = {workers:CloudPart<CloudWorkers>;rows:CloudPart<CloudRows>;storage:CloudPart<CloudStorage>}
export function emptyCloudUsage():CloudUsage {
  return {workers:{value:null,checkedAt:null,error:false},rows:{value:null,checkedAt:null,error:false},storage:{value:null,checkedAt:null,error:false}}
}
export function cloudPartStale(part:CloudPart<unknown>,now=Date.now()) {
  return part.checkedAt===null || part.error || now-part.checkedAt>45*60_000 || Math.floor(part.checkedAt/86400000)!==Math.floor(now/86400000)
}
export function cloudDay(now:number) {return Math.floor(now/86400000)*86400000}
