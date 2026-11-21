// Entry point inside an unprivileged, offline container. No provider credentials.
import {readFile,writeFile} from 'node:fs/promises'
import sharp from 'sharp'
import {networkInterfaces} from 'node:os'
import {prepareApprovedPdf,LocalPublicationAssets} from '../admin-publisher/assets'
import {prepareCover,saveImage} from '../free/jobs/prepare'
import {prepareReaderPack} from '../free/jobs/reader-pack'
import {optimizeReaderPdf} from '../free/jobs/reader-pdf'
import {renderReaderPages} from '../lib/pdf-preview-render'
async function main(){
const {task,metadata}=JSON.parse(await readFile('/input/request.json','utf8')),data=new Uint8Array(await readFile('/input/source'))
let result
if(task==='approved') {
 const assets=new LocalPublicationAssets('/work/edition');await assets.init();result=await prepareApprovedPdf(metadata,data,assets);await assets.verify(metadata,result)
}else if(task==='cover')result=await prepareCover(metadata.item,undefined,{download:async()=>({data,lastModified:metadata.modified}),render:renderReaderPages,save:saveImage,optimize:optimizeReaderPdf,pack:prepareReaderPack},metadata.skip)
else if(task==='pack')result=await prepareReaderPack(metadata.id,data)
else if(task==='optimize')result=await optimizeReaderPdf(metadata.id,data)
else if(task==='image') {
 const image=await sharp(data,{limitInputPixels:40_000_000,failOn:'error'}).rotate().resize({width:2048,height:4096,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer()
 await writeFile('/work/image.webp',image);result={bytes:image.length}
}else if(task==='probe') {
 const status=await readFile('/proc/self/status','utf8')
 let readOnly=false;try{await writeFile('/input/test-write','blocked')}catch{readOnly=true}
 result={network:Object.keys(networkInterfaces()).every(k=>k==='lo'),noPrivileges:/NoNewPrivs:\s+1/.test(status),noCapabilities:/CapEff:\s+0+\s/.test(status),readOnly,noSecrets:!process.env.CLOUDFLARE_API_TOKEN&&!process.env.NOTION_TOKEN&&!process.env.SMP_SANDBOX_CANARY}
}else throw Error('Unknown media task')
await writeFile('/work/result.json',JSON.stringify(result??null))

}
void main().catch(error=>{console.error(error);process.exitCode=1})
