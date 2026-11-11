import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import {publicCover,type PublicCover} from '../../lib/public-cover'
import {reportSharePath,type ShareText} from '../../lib/report-share-image'
import {createShareRenderer} from './share-artwork'

type Candidate=ShareText & {id:string;cover:unknown}
const defaultRoot='.smp-cache/covers'
export async function prepareReportShares(records:Candidate[],root=defaultRoot) {
  const urls=new Map<string,{source:string;item:ShareText}>()
  for(const row of records) {
    const cover=publicCover({id:row.id,kind:'research',cover:row.cover as PublicCover})
    if(!cover)continue
    const source=cover.previewUrl??cover.url,url=reportSharePath(source,row)
    if(url)urls.set(url,{source,item:row})
  }
  if(urls.size>1000)throw Error('Report sharing image budget exceeded')
  let render:Awaited<ReturnType<typeof createShareRenderer>>|undefined
  const keep:string[]=[]
  for(const [url,{source,item}] of urls) {
    const relative=url.slice('/report-shares/'.length),output=path.join(root,'_share',relative)
    let ready=false
    try{const meta=await sharp(output).metadata();ready=meta.width===2400&&meta.height===1260&&meta.format==='jpeg'}catch{}
    if(!ready) {
      const data=await readFile(path.join(root,source.slice('/report-covers/'.length)))
      if(createHash('sha256').update(data).digest('hex')!==path.basename(source,'.webp'))throw Error('Sharing cover integrity check failed')
      render??=await createShareRenderer()
      const image=await render(data,item)
      if(image.length>1024*1024)throw Error('Sharing image size budget exceeded')
      await mkdir(path.dirname(output),{recursive:true});await writeFile(output,image)
    }
    keep.push(relative)
  }
  await mkdir(path.join(root,'_share'),{recursive:true})
  await writeFile(path.join(root,'_share','manifest.json'),JSON.stringify(keep))
  return keep
}
