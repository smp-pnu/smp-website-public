// Only URL-bearing fields are assets. An excerpt or caption may mention an
// asset-looking string, but that must never trigger a download or deployment.
export function publicationAssets(values:unknown[],origin="https://pnusmp.com"):Set<string> {
  const paths=new Set<string>()
  function visit(value:unknown) {
    if(!value || typeof value!=='object')return
    if(Array.isArray(value)){value.forEach(visit);return}
    for(const [key,child] of Object.entries(value)) {
      if((key==='url'||key==='previewUrl') && typeof child==='string') {
        let url:URL
        try{url=new URL(child,origin)}catch{continue}
        if(![origin,"https://pnusmp.com"].includes(url.origin)||url.search||url.hash)continue
        if(/^\/report-covers\/[a-f0-9]{32}\/[a-f0-9]{64}\.webp$/.test(url.pathname))paths.add(url.pathname)
      } else if(typeof child==='object')visit(child)
    }
  }
  values.forEach(visit)
  return paths
}
export function requiresAssetDeployment(current:ReadonlySet<string>,next:ReadonlySet<string>,force=false) {
  return force || [...next].some(path=>!current.has(path))
}
