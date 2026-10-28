// Public ingestion token from the existing free Web Analytics site, not an
// account/API credential. Install only on the public host, never the admin.
export function installWebAnalytics(){
 if(location.hostname!=='pnusmp.com'||navigator.doNotTrack==='1'||navigator.webdriver||document.querySelector('script[data-cf-beacon]'))return
 const install=()=>{
  if(document.querySelector('script[data-cf-beacon]'))return
  const script=document.createElement('script')
  script.type='module';script.async=true;script.fetchPriority='low'
  script.src='https://static.cloudflareinsights.com/beacon.min.js'
  script.setAttribute('data-cf-beacon',JSON.stringify({token:'b53bb288b1164828b38311dc2341412e',spa:true}))
  document.body.appendChild(script)
 }
 // First paint and the report reader take priority over measurement.
 if('requestIdleCallback' in window)window.requestIdleCallback(install,{timeout:2000})
 else setTimeout(install,1500)
}
