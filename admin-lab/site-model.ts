export type SiteRange=1|7|30
export type Traffic={reportsComplete?:boolean;visits:number;views:number;lastViewAt?:number|null;daily:{day:string;views:number;visits:number}[];reports:{id:string;views:number}[];referrers:{host:string;visits:number}[]}
export type ReportVisibility='public'|'private'|'trashed'|'missing'
export type ReportMetric={id:string;views:number|null;downloads:number;failed:number;started?:number;ready?:number;totalMs?:number}
export type SiteReport=ReportMetric & {title:string;visibility?:ReportVisibility;semester?:string;company?:string;ticker?:string}
export type SitePeriod={traffic:Traffic|null;lastDownloadAt?:number|null;downloads:number;started:number;ready:number;failed:number;averageMs:number|null;slow:number;reports:SiteReport[];allReports?:SiteReport[];dailyDownloads:{day:string;count:number}[]}
export type SiteSnapshot={startedAt:number;checkedAt:number;trafficCheckedAt:number|null;trafficError:boolean;limitedDays:string[];periods:Record<SiteRange,SitePeriod>}
export function emptySitePeriod():SitePeriod{return {traffic:null,downloads:0,started:0,ready:0,failed:0,averageMs:null,slow:0,reports:[],dailyDownloads:[]}}
export const SITE_RANGES=[1,7,30] as const
export function siteStart(now:number,days:number){return Math.floor((now+9*3600000)/86400000)*86400000-9*3600000-(days-1)*86400000}
export function siteDate(now:number){return new Date(now+9*3600000).toISOString().slice(0,10)}

export const REPORT_ANALYTICS_LIMIT=1000
export type ReportAnalytics=SiteSnapshot & {catalogSize:number;complete:Record<SiteRange,boolean>}
