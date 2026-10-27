import publicWorker from "../free/server/worker"
import { spend } from "../free/server/budget"
import { Busy, type Env, type Context } from "../free/server/types"
import { previewReader } from "./preview"

export type TrialEnv = Pick<Env,"CMS_DB"|"ASSETS"|"API_RATE_LIMIT"> & { TRIAL_ORIGIN:string; TRIAL_VALID_UNTIL:string }
const readers = new WeakMap<Env['CMS_DB'],Promise<NonNullable<Env['REPORT_PREVIEW']>>>()
const noindex = {"X-Robots-Tag":"noindex, nofollow, noarchive","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}

// Separate, temporary read-only deployment. No Notion, Drive, AI, publisher
// secret, cron, service binding or mutation handler is attached to this Worker.
export default {
  async fetch(request:Request,env:TrialEnv,ctx:Context):Promise<Response> {
    const url=new URL(request.url)
    if(url.origin!==env.TRIAL_ORIGIN || !/^https:\/\/smp-report-publication-trial\.smp-website\.workers\.dev$/.test(env.TRIAL_ORIGIN))
      return new Response('Not found',{status:404,headers:noindex})
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Read-only trial',{status:405,headers:noindex})
    if(url.pathname==='/robots.txt')return new Response('User-agent: *\nDisallow: /\n',{headers:{...noindex,'Content-Type':'text/plain'}})
    const until=Number(env.TRIAL_VALID_UNTIL)
    if(!Number.isSafeInteger(until)||until<=Date.now())return new Response('시험 게시 기간이 종료되었습니다.',{status:410,headers:noindex})
    let path:string
    try {path=decodeURIComponent(url.pathname)}catch{return new Response('Not found',{status:404,headers:noindex})}
    const allowed=path==='/'||path==='/research'||/^\/research\/[a-f0-9]{32}$/.test(path)||path==='/api/health'
      ||path==='/api/catalog/research'||path==='/api/search'||/^\/api\/(detail|content)\/research\/[a-f0-9]{32}(\/pdf)?$/.test(path)
      ||/^\/report-covers\/[a-f0-9]{32}\/[a-f0-9]{64}\.webp$/.test(path)
    if(!allowed)return new Response('Not found',{status:404,headers:noindex})
    if(path==='/')return new Response(null,{status:302,headers:{...noindex,Location:'/research'}})
    try {
      if(env.API_RATE_LIMIT&&!(await env.API_RATE_LIMIT.limit({key:request.headers.get('cf-connecting-ip')??'unknown'})).success)throw new Busy(60)
      await spend(env.CMS_DB,'report-trial-day',500,86400000)
      if(path==='/api/health')return Response.json({ok:true,mode:'approved-report-trial',readOnly:true,expiresAt:new Date(until).toISOString()},{headers:noindex})
      let reader=readers.get(env.CMS_DB)
      if(!reader){reader=previewReader(env.CMS_DB,env.ASSETS);readers.set(env.CMS_DB,reader)}
      const response=await publicWorker.fetch(request,{...env,SMP_READ_ONLY:'1',SMP_FIXTURE:'1',REPORT_PREVIEW:await reader},ctx)
      const headers=new Headers(response.headers)
      for(const [name,value] of Object.entries(noindex))headers.set(name,value)
      return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers})
    }catch(error){
      return new Response(error instanceof Busy?'시험 사이트의 일일 또는 요청 한도에 도달했습니다.':'시험 게시 자료를 확인할 수 없습니다.',{status:error instanceof Busy?429:503,headers:{...noindex,...(error instanceof Busy?{'Retry-After':String(error.seconds)}:{})}})
    }
  },
}
