// Synthetic, local-only rehearsal. No env file, remote D1, live credential or
// deployment command is used. The real admin API and publisher run in process.
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { publicationFixture } from '../tests/publication-fixture.ts'
import { initPreview, localDatabase } from '../admin-publisher/local-database.ts'
import { LocalPublicationAssets } from '../admin-publisher/assets.ts'
import { publishReports } from '../admin-publisher/runner.ts'
import { previewReader } from '../admin-publisher/preview.ts'
import worker from '../free/server/worker.ts'

const args=process.argv.slice(2)
if(args.length!==2 || args[0]!=='--out' || !path.isAbsolute(args[1]) || args[1]===path.parse(args[1]).root)throw Error('Use --out /absolute/new/private-directory')
const out=path.resolve(args[1]),repo=path.resolve(import.meta.dirname,'..')
if(out===repo || out.startsWith(repo+path.sep))throw Error('Keep preview data outside the repository')
await mkdir(out,{mode:0o700}) // Deliberately refuses to overwrite an earlier rehearsal.
const target=localDatabase(path.join(out,'preview.sqlite')),fixture=await publicationFixture()
await initPreview(target.sqlite)
await fixture.connectDrive()
for(let index=0;index<2;index++) {
  const {draft}=await fixture.upload(index)
  await fixture.change(draft,{type:'approve',reviewed:true})
}
const assets=new LocalPublicationAssets(path.join(out,'assets'));await assets.init()
const result=await publishReports(fixture.source(),target.db,assets)
if(result.failed||result.published!==2)throw Error('Preview publication failed')
await writeFile(path.join(out,'verification.json'),JSON.stringify({synthetic:true,productionModified:false,result,assetBytes:assets.bytes,assetFiles:assets.files},null,2),{mode:0o600})
const client=path.join(repo,'dist/free/client')
await stat(path.join(client,'page-shell.html'))
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'}
const staticFetch=async(request)=>{
  const url=new URL(request.url)
  if(url.pathname.startsWith('/report-covers/')||url.pathname.startsWith('/_reader-pdfs/'))return assets.fetch(request)
  let decoded
  try{decoded=decodeURIComponent(url.pathname)}catch{return new Response('Not found',{status:404})}
  if(decoded.includes('\\'))return new Response('Not found',{status:404})
  const file=path.resolve(client,'.'+decoded+(path.extname(decoded)?'':decoded==='/'?'index.html':'.html'))
  if(!file.startsWith(client+path.sep))return new Response('Not found',{status:404})
  try{return new Response(await readFile(file),{headers:{'Content-Type':mime[path.extname(file)]??'application/octet-stream'}})}catch{return new Response('Not found',{status:404})}
}
Object.assign(globalThis,{__SMP_FIXTURE__:true})
const env={CMS_DB:target.db,ASSETS:{fetch:staticFetch},SMP_FIXTURE:'1',SMP_READ_ONLY:'1',REPORT_PREVIEW:await previewReader(target.db,assets)}
const server=createServer(async(req,res)=>{
  if(req.headers.host!=='127.0.0.1:3017' || !['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end();return}
  try{
    const response=await worker.fetch(new Request('http://127.0.0.1:3017'+req.url,{method:req.method,headers:req.headers}),env,{waitUntil:p=>p.catch(()=>{})})
    res.writeHead(response.status,{...Object.fromEntries(response.headers),'X-Robots-Tag':'noindex, nofollow, noarchive'})
    if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end()
  }catch{res.writeHead(503);res.end('Preview unavailable')}
})
server.listen(3017,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:3017/research',synthetic:true,result})))
const close=()=>server.close(()=>{target.sqlite.close();fixture.sqlite.close();process.exit(0)})
process.on('SIGINT',close);process.on('SIGTERM',close)
