import type { ContentItem } from "../../lib/content-model"
import { getPdfSources } from "../../lib/pdf-source"
import { sourceKey } from "../../lib/cover-metadata"
import { preparedReader } from "../../lib/report-reader"
import { parsePdfRange, parsePdfContentRange } from "../../lib/pdf-range"
import { pdfHeaders, streamPdf } from "../../lib/pdf-response"
import { singleFlight } from "../../lib/single-flight"
import type { Env, Context } from "./types"
import { readReaderAsset } from "./reader-asset"

const freshnessMs=300_000
const verification=singleFlight<boolean>()
type ProofCache=Pick<Cache,"match"|"put">

// Only called after visitorPublication. Raw asset paths are never public routes.
export async function readerPdf(request:Request,item:ContentItem,env:Env,ctx:Context,
  cache:ProofCache|undefined=(globalThis as unknown as {caches?:{default:ProofCache}}).caches?.default):Promise<Response|undefined> {
  const url=new URL(request.url),wanted=url.searchParams.get("prepared")
  if(item.kind!=="research" || url.searchParams.get("download")==="1") return
  const pdf=getPdfSources(item)[0]
  if(!pdf || (!wanted && (url.searchParams.get("source")==="external"?"source=external":`index=${url.searchParams.get("index")??"0"}`)!==pdf.query)) return
  const missing=()=>wanted?new Response("Not found",{status:404,headers:pdfHeaders}):undefined
  const row=await env.CMS_DB.prepare("SELECT body_revision,cover FROM free_content WHERE id=? AND kind='research'").bind(item.id).first<{body_revision:string;cover:string|null}>()
  if(!row || row.body_revision!==item.editedAt || !row.cover) return missing()
  const cover=JSON.parse(row.cover),reader=preparedReader(item.id,cover.reader),asset=reader?.pdf
  if(!asset || cover.sourceKey!==sourceKey(item) || (wanted && !asset.url.endsWith(`/${wanted}.pdf`))) return missing()
  const range=request.headers.get("range")
  if(range && !parsePdfRange(range)) return new Response("Unsupported range",{status:416,headers:pdfHeaders})
  // Never mix old prepared bytes with a replaced Drive file at the same URL.
  // Compare source mtime + length at most once per 5 minutes per cached copy.
  // This matches the existing short-lived PDF cache freshness bound.
  const now=Date.now(),proofKey=new Request(new URL(`/api/cache/reader-proof/${item.id}/${cover.pdfHash}`,url))
  let fresh=now>=asset.checkedAt && now-asset.checkedAt<freshnessMs
  if(!fresh) fresh=await verification(proofKey.url,async()=>{
    try {
      const proof=await cache?.match(proofKey)
      if(proof) { const checked=Number(await proof.text()); if(now>=checked && now-checked<freshnessMs) return true }
      const response=await streamPdf(pdf.url,pdf.name,false,AbortSignal.timeout(12000),"bytes=0-4")
      const total=parsePdfContentRange(response.headers.get("content-range"))?.total
      const modified=response.headers.get("last-modified")
      await response.body?.cancel()
      if(response.status!==206 || total!==asset.sourceBytes || modified!==asset.sourceModified) return false
      if(cache) ctx.waitUntil(cache.put(proofKey,new Response(String(Date.now()),{headers:{"Cache-Control":"public, max-age=300"}})).catch(()=>{}))
      return true
    } catch { return false }
  })
  if(!fresh) return missing()
  const response=await readReaderAsset(request,asset,env,cache)
  if(!response)return missing()
  const headers=new Headers(pdfHeaders)
  for(const name of ["content-length","content-range"])if(response.headers.has(name))headers.set(name,response.headers.get(name)!)
  headers.set("Content-Type","application/pdf");headers.set("Accept-Ranges",response.headers.get("accept-ranges")??"bytes")
  headers.set("Content-Disposition","inline; filename=\"report.pdf\"")
  headers.set("Content-Security-Policy","sandbox")
  headers.set("Server-Timing",'pdf-source;desc="PREPARED"')
  return new Response(response.body,{status:response.status,headers})
}
