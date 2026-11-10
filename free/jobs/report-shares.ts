import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import {publicCover,type PublicCover} from '../../lib/public-cover'
import {reportSharePath} from '../../lib/report-share-image'

type Candidate={id:string;cover:unknown}
const defaultRoot='.smp-cache/covers'
export async function prepareReportShares(records:Candidate[],root=defaultRoot) {
  const urls=new Map<string,string>()
  for(const row of records) {
    const cover=publicCover({id:row.id,kind:'research',cover:row.cover as PublicCover})
    if(!cover)continue
    const source=cover.previewUrl??cover.url,url=reportSharePath(source)
    if(url)urls.set(url,source)
  }
  if(urls.size>1000)throw Error('Report sharing image budget exceeded')
  // Browser-rasterized original SVG avoids hairline seams between its paths.
  const logo=await sharp('public/share/smp-logo-white.png').resize({width:420}).png().toBuffer()
  const scene=Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#2c2e31"/><stop offset="1" stop-color="#17191c"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <path d="M680 0H1200V630H680Z" fill="#deded9"/>
    <path d="M680 456H1200V630H680Z" fill="#f6f6f3"/>
    <text x="72" y="84" font-family="Arial,sans-serif" font-size="18" letter-spacing="3" fill="#b7b9bc">SMP RESEARCH</text>
    <text x="72" y="556" font-family="Arial,sans-serif" font-size="19" letter-spacing="1" fill="#b7b9bc">pnusmp.com</text>
  </svg>`)
  const keep:string[]=[]
  for(const [url,source] of urls) {
    const relative=url.slice('/report-shares/'.length),output=path.join(root,'_share',relative)
    let ready=false
    try{const meta=await sharp(output).metadata();ready=meta.width===1200&&meta.height===630&&meta.format==='png'}catch{}
    if(!ready) {
      const data=await readFile(path.join(root,source.slice('/report-covers/'.length)))
      if(createHash('sha256').update(data).digest('hex')!==path.basename(source,'.webp'))throw Error('Sharing cover integrity check failed')
      const cover=await sharp(data,{limitInputPixels:20_000_000}).resize({width:390,height:550,fit:'inside'}).png().toBuffer({resolveWithObject:true})
      const left=Math.round(940-cover.info.width/2),top=Math.round(315-cover.info.height/2)
      const shadow=await sharp({create:{width:cover.info.width+48,height:cover.info.height+48,channels:4,background:'#00000000'}})
        .composite([{input:Buffer.from(`<svg width="${cover.info.width+48}" height="${cover.info.height+48}"><rect x="24" y="24" width="${cover.info.width}" height="${cover.info.height}" fill="#101316" opacity=".28"/></svg>`)}]).png().toBuffer()
      const soft=await sharp(shadow).blur(12).toBuffer()
      const image=await sharp(scene).composite([{input:soft,left:left-24,top:top-16},{input:logo,left:120,top:201},{input:cover.data,left,top}]).png().toBuffer()
      if(image.length>1024*1024)throw Error('Sharing image size budget exceeded')
      await mkdir(path.dirname(output),{recursive:true});await writeFile(output,image)
    }
    keep.push(relative)
  }
  await mkdir(path.join(root,'_share'),{recursive:true})
  await writeFile(path.join(root,'_share','manifest.json'),JSON.stringify(keep))
  return keep
}
