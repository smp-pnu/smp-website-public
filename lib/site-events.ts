// Only public report IDs and coarse performance measurements leave the browser.
// There are no cookies, persistent visitor IDs, search queries or file contents.
export type SiteEvent = {id:string;report:string;kind:'download'|'start'|'ready'|'failed';ms:number}
const pending:SiteEvent[]=[]
let timer:ReturnType<typeof setTimeout>|undefined,installed=false,sent=0
export function publicReportId(value:string) {
  const match=/^\/api\/content\/research\/([a-f0-9-]{32,36})\/pdf(?:\?|$)/.exec(value)
  const id=match?.[1].replaceAll('-','')
  return id&&/^[a-f0-9]{32}$/.test(id)?id:null
}
function enabled() {
  return typeof window!=='undefined'&&location.hostname==='pnusmp.com'&&navigator.doNotTrack!=='1'&&!navigator.webdriver
}
function flush() {
  clearTimeout(timer);timer=undefined
  const events=pending.splice(0,8)
  if(!events.length)return
  // Never retry: analytics must not compete with a PDF or a visitor's navigation.
  void fetch('/api/site-events',{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({events})}).catch(()=>{})
}
function queue(event:SiteEvent) {
  if(!enabled()||sent>=30)return
  sent++;pending.push(event)
  if(!installed){installed=true;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});window.addEventListener('pagehide',flush)}
  if(pending.length>=8)flush()
  else if(!timer)timer=setTimeout(flush,3000)
}
export function observePdf(url:string|undefined) {
  const report=url&&publicReportId(url)
  if(!report||!enabled())return ()=>{}
  const id=crypto.randomUUID().replaceAll('-',''),start=performance.now();let done=false
  queue({id:`${id}:start`,report,kind:'start',ms:0})
  return (result:'ready'|'failed')=>{
    if(done)return;done=true
    queue({id:`${id}:result`,report,kind:result,ms:Math.min(600000,Math.max(0,Math.round(performance.now()-start)))})
  }
}
export function observeDownloads() {
  if(!enabled())return ()=>{}
  let last='',lastAt=0
  const click=(event:MouseEvent)=>{
    if(event.defaultPrevented||!event.isTrusted||!(event.target instanceof Element))return
    const anchor=event.target.closest('a[href]')
    if(!anchor)return
    const url=new URL(anchor.getAttribute('href')!,location.href)
    const report=url.origin===location.origin&&url.searchParams.get('download')==='1'&&publicReportId(url.pathname)
    if(!report||last===report&&Date.now()-lastAt<1500)return
    last=report;lastAt=Date.now()
    queue({id:`${crypto.randomUUID().replaceAll('-','')}:download`,report,kind:'download',ms:0})
  }
  document.addEventListener('click',click)
  return ()=>document.removeEventListener('click',click)
}
