import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { preparedReader, readerPdfParts, readerPackSource } from "../../lib/report-reader"
import readerLimits from "../reader-storage-limits.json"
import type { PagePackAsset } from '../../lib/pdf-page-pack'

// Application safeguards, below free static-file and runner/cache capacity.
// All complete editions are retained; only optional duplicate PDFs rotate.
export const readerAssetBudget = readerLimits
type Candidate={id:string;date:string;cover:unknown}
export function selectReaderAssets(records:Candidate[]) {
  const selected: {id:string;url:string;bytes:number;chunkSize?:number;pagePack?:PagePackAsset;packSource?:string}[]=[],seen=new Set<string>()
  let bytes=0,files=0,packBytes=0,packFiles=0,pdfFiles=0
  const candidates=[...records].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).filter(row=>{
    if(seen.has(row.id))return false
    seen.add(row.id)
    return true
  }).map(row=>({...row,reader:preparedReader(row.id,(row.cover as {reader?:unknown})?.reader)}))
  // Reading images take priority over optional duplicate PDF bytes. A large
  // original must not exclude an otherwise small, complete reading edition.
  for(const row of candidates) {
    const pack=row.reader?.pagePack,source=row.reader && readerPackSource(row.reader)
    if(!pack || !source)continue
    if(packFiles+1>readerAssetBudget.packFiles || packBytes+pack.bytes>readerAssetBudget.packBytes)throw new Error('Complete reader library exceeds storage safety budget')
    selected.push({id:row.id,url:row.reader?.pdf?.url??`/_reader-pdfs/${row.id}/${source.key}.pdf`,bytes:0,pagePack:pack,packSource:source.key})
    packBytes+=pack.bytes;packFiles++;files++
  }
  for(const row of candidates) {
    const asset=row.reader?.pdf,existing=selected.find(value=>value.id===row.id)
    if(!asset || pdfFiles>=readerAssetBudget.files || bytes+asset.bytes>readerAssetBudget.bytes)continue
    const count=readerPdfParts(asset).length
    if(files+count>readerAssetBudget.assetFiles)continue
    const value={id:row.id,url:asset.url,bytes:asset.bytes,...(asset.chunkSize?{chunkSize:asset.chunkSize}:{})}
    if(existing)Object.assign(existing,value);else selected.push(value)
    bytes+=asset.bytes;files+=count;pdfFiles++
  }
  return selected
}
// Never evict a published complete edition to deploy unrelated content.
// A failed recovery preserves the previous deployment and retries later.
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
      // During an upgrade the deployed server may still use the legacy PDF
      // hash. Recover the identical, integrity-checked pack under either key.
      for(const source of new Set([asset.packSource??hash,hash])) {
        if(present || Date.now()>=deadline)break
        try {
        const response=await fetch(new URL(`/api/content/research/${asset.id}/pdf?prepared=${source}&pages=${key}`,origin),{redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))})
        if(response.ok && response.headers.get('content-type')==='application/octet-stream' && Number(response.headers.get('content-length'))===packed.bytes) {
          const data=Buffer.from(await response.arrayBuffer())
          if(valid(data)){await mkdir(`${root}/${asset.id}`,{recursive:true});await writeFile(`${root}/${path}`,data);present=true}
        }else await response.body?.cancel()
        }catch{/* Missing optional pages fall back to local PDF rendering. */}
      }
      if(!present)throw new Error("Cannot recover a complete reader edition; keeping the current deployment")
      keep.add(path)
    }
    if(!asset.bytes)continue
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
