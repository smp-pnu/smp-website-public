import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import {createShareRenderer} from './share-artwork'
import {selectReportShares,type ShareCandidate} from './report-share-manifest'
import {pruneReportShareFiles} from '../../scripts/report-share-files.mjs'

const defaultRoot='.smp-cache/covers'
export async function prepareReportShares(records:ShareCandidate[],root=defaultRoot) {
  const urls=selectReportShares(records)
  let render:Awaited<ReturnType<typeof createShareRenderer>>|undefined
  const keep:string[]=[]
  for(const [relative,{source,item}] of urls) {
    const output=path.join(root,'_share',relative)
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
  await pruneReportShareFiles(path.join(root,'_share'),keep)
  return keep
}
