// Design-only preview. Capture the full 2400×1260 page after fonts and images load.
// Export JPEG at quality 95 with 4:4:4 chroma; the server is never deployed.
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
const root=new URL('../',import.meta.url)
const paths=new Map([
  ['/', ['design/share-card.html','text/html; charset=utf-8']],
  ['/logo-render', ['design/share-logo.html','text/html; charset=utf-8']],
  ['/logo.svg',['public/smp-symbol-white.svg','image/svg+xml']],
  ['/background.png',['public/home-gwangan-3.png','image/png']],
  ['/fonts/wght.css',['node_modules/@fontsource-variable/noto-sans-kr/wght.css','text/css']],
])
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname
  const asset=paths.get(path) ?? (/^\/fonts\/files\/noto-sans-kr-[a-z0-9-]+\.woff2$/.test(path)
    ?['node_modules/@fontsource-variable/noto-sans-kr/'+path.slice('/fonts/'.length),'font/woff2']:null)
  if(!asset){res.writeHead(404).end();return}
  try{res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':'no-store'}).end(await readFile(new URL(asset[0],root)))}
  catch{res.writeHead(404).end()}
})
server.listen(3040,'127.0.0.1',()=>console.log('SMP share card: http://127.0.0.1:3040/'))
