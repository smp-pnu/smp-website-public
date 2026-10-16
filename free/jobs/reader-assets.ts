import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { preparedReader } from "../../lib/report-reader"

export const readerAssetBudget = { files:32, bytes:512*1024*1024 }
type Candidate={id:string;date:string;cover:unknown}
export function selectReaderAssets(records:Candidate[]) {
  const selected: {id:string;url:string;bytes:number}[]=[],seen=new Set<string>()
  let bytes=0
  for(const row of [...records].sort((a,b)=>b.date.localeCompare(a.date))) {
    if(seen.has(row.id))continue
    seen.add(row.id)
    const asset=preparedReader(row.id,(row.cover as {reader?:unknown})?.reader)?.pdf
    if(!asset || selected.length>=readerAssetBudget.files || bytes+asset.bytes>readerAssetBudget.bytes)continue
    selected.push({id:row.id,url:asset.url,bytes:asset.bytes});bytes+=asset.bytes
  }
  return selected
}
// Optional speed copies have a hard storage ceiling. Missing copies always
// fall back to Drive; recovery never downloads an original by accident.
export async function prepareReaderAssets(records:Candidate[],origin:URL,deadline=Date.now()+90_000) {
  const root=".smp-cache/reader-pdfs",keep=new Set<string>()
  await mkdir(root,{recursive:true})
  for(const asset of selectReaderAssets(records)) {
    const suffix=asset.url.slice("/_reader-pdfs/".length),file=`${root}/${suffix}`,hash=suffix.split("/")[1].slice(0,-4)
    try {
      await access(file)
      const local=await readFile(file)
      if(local.length===asset.bytes && createHash("sha256").update(local).digest("hex")===hash){keep.add(suffix);continue}
    } catch {}
    if(Date.now()>=deadline)continue
    try {
      const response=await fetch(new URL(`/api/content/research/${asset.id}/pdf?prepared=${hash}`,origin),{redirect:"error",signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))})
      if(!response.ok || response.headers.get("content-type")!=="application/pdf" || Number(response.headers.get("content-length"))!==asset.bytes){await response.body?.cancel();continue}
      const data=Buffer.from(await response.arrayBuffer())
      if(data.length!==asset.bytes || createHash("sha256").update(data).digest("hex")!==hash)continue
      await mkdir(`${root}/${asset.id}`,{recursive:true});await writeFile(file,data);keep.add(suffix)
    } catch { /* Optional acceleration, never a reason to block publishing. */ }
  }
  for(const dir of await readdir(root,{withFileTypes:true})) {
    if(!dir.isDirectory() || !/^[a-f0-9]{32}$/.test(dir.name))continue
    for(const name of await readdir(`${root}/${dir.name}`))if(/^[a-f0-9]{64}\.pdf$/.test(name) && !keep.has(`${dir.name}/${name}`))await rm(`${root}/${dir.name}/${name}`)
  }
  return keep
}
