import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { preparedReader, readerPdfParts } from "../../lib/report-reader"
import type { PagePackAsset } from '../../lib/pdf-page-pack'

export const readerAssetBudget = { files:32, bytes:512*1024*1024 }
type Candidate={id:string;date:string;cover:unknown}
export function selectReaderAssets(records:Candidate[]) {
  const selected: {id:string;url:string;bytes:number;chunkSize?:number;pagePack?:PagePackAsset}[]=[],seen=new Set<string>()
  let bytes=0,files=0
  for(const row of [...records].sort((a,b)=>b.date.localeCompare(a.date))) {
    if(seen.has(row.id))continue
    seen.add(row.id)
    const reader=preparedReader(row.id,(row.cover as {reader?:unknown})?.reader),asset=reader?.pdf
    if(!asset || selected.length>=readerAssetBudget.files || bytes+asset.bytes>readerAssetBudget.bytes)continue
    const count=readerPdfParts(asset).length
    if(files+count>544)continue
    const pack=reader?.pagePack
    const pagePack=pack && bytes+asset.bytes+pack.bytes<=readerAssetBudget.bytes && files+count+1<=544?pack:undefined
    selected.push({id:row.id,url:asset.url,bytes:asset.bytes,...(asset.chunkSize?{chunkSize:asset.chunkSize}:{}),...(pagePack?{pagePack}:{})})
    bytes+=asset.bytes+(pagePack?.bytes??0);files+=count+(pagePack?1:0)
  }
  return selected
}
// Optional speed copies have a hard storage ceiling. Missing copies always
// fall back to Drive; recovery never downloads an original by accident.
export async function prepareReaderAssets(records:Candidate[],origin:URL,deadline=Date.now()+90_000) {
  const root=".smp-cache/reader-pdfs",keep=new Set<string>()
  await mkdir(root,{recursive:true})
  for(const asset of selectReaderAssets(records)) {
    const hash=asset.url.split('/').at(-1)!.slice(0,-4),parts=readerPdfParts(asset)
    if(asset.pagePack) {
      const packed=asset.pagePack,path=packed.url.slice('/_reader-pdfs/'.length),key=packed.url.split('/').at(-1)!.slice(0,-5)
      const valid=(bytes:Uint8Array)=>bytes.length===packed.bytes && createHash('sha256').update(bytes).digest('hex')===key
      let present=false
      try {present=valid(await readFile(`${root}/${path}`))}catch{}
      if(!present && Date.now()<deadline)try {
        const response=await fetch(new URL(`/api/content/research/${asset.id}/pdf?prepared=${hash}&pages=${key}`,origin),{redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))})
        if(response.ok && response.headers.get('content-type')==='application/octet-stream' && Number(response.headers.get('content-length'))===packed.bytes) {
          const data=Buffer.from(await response.arrayBuffer())
          if(valid(data)){await mkdir(`${root}/${asset.id}`,{recursive:true});await writeFile(`${root}/${path}`,data);present=true}
        }else await response.body?.cancel()
      }catch{/* Missing optional pages fall back to local PDF rendering. */}
      if(present)keep.add(path)
    }
    const paths=parts.map(part=>part.url.slice('/_reader-pdfs/'.length))
    try {
      const digest=createHash('sha256');let valid=true
      for(let i=0;i<parts.length;i++) {
        const bytes=await readFile(`${root}/${paths[i]}`)
        if(bytes.length!==parts[i].bytes){valid=false;break}
        digest.update(bytes)
      }
      if(valid && digest.digest('hex')===hash){paths.forEach(path=>keep.add(path));continue}
    } catch {}
    if(Date.now()>=deadline)continue
    try {
      const response=await fetch(new URL(`/api/content/research/${asset.id}/pdf?prepared=${hash}`,origin),{redirect:"error",signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))})
      if(!response.ok || response.headers.get("content-type")!=="application/pdf" || Number(response.headers.get("content-length"))!==asset.bytes){await response.body?.cancel();continue}
      const data=Buffer.from(await response.arrayBuffer())
      if(data.length!==asset.bytes || createHash("sha256").update(data).digest("hex")!==hash)continue
      await mkdir(`${root}/${asset.id}`,{recursive:true})
      for(let i=0;i<parts.length;i++) {
        await writeFile(`${root}/${paths[i]}`,data.subarray(parts[i].start,parts[i].start+parts[i].bytes))
        keep.add(paths[i])
      }
    } catch { /* Optional acceleration, never a reason to block publishing. */ }
  }
  for(const dir of await readdir(root,{withFileTypes:true})) {
    if(!dir.isDirectory() || !/^[a-f0-9]{32}$/.test(dir.name))continue
    for(const name of await readdir(`${root}/${dir.name}`))if(/^[a-f0-9]{64}(\.pdf|\.pack|\.\d{4}\.bin)$/.test(name) && !keep.has(`${dir.name}/${name}`))await rm(`${root}/${dir.name}/${name}`)
  }
  return keep
}
