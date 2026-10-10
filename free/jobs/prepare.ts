import { createHash } from "node:crypto"
import { mkdir,writeFile } from "node:fs/promises"
import sharp from "sharp"
import type { ContentItem } from "../../lib/content-model"
import type { Member } from "../../lib/member-model"
import { fileUrl } from "../../lib/content-model"
import { blockValue,type ContentBlock } from "../../lib/notion-model"
import { getPdfSources,isNotionFileUrl } from "../../lib/pdf-source"
import { downloadPdfForPreview,renderFirstPage } from "../../lib/pdf-preview-render"
import { sourceKey } from "../../lib/cover-metadata"
import { cmsImageUrl } from "../../lib/cms-image-url"
import { notion } from "../server/notion"
import type { Env } from "../server/types"
const children=new Set(["paragraph","heading_1","heading_2","heading_3","bulleted_list_item","numbered_list_item","quote","callout","toggle","to_do","column_list","column","table"])
export type Cover={url:string;previewUrl:string;width:number;height:number;sourceKey?:string;pdfHash?:string}
export async function saveImage(id:string,bytes:Uint8Array) {
  const hash=createHash("sha256").update(bytes).digest("hex")
  const dir=`.smp-cache/covers/${id}`
  await mkdir(dir,{recursive:true});await writeFile(`${dir}/${hash}.webp`,bytes)
  return `/report-covers/${id}/${hash}.webp`
}
async function notionImage(url:string) {
  // No general URL fetcher: only Notion-owned signed uploads are copied.
  if(!isNotionFileUrl(url)) throw new Error("Unsupported saved image")
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30_000)})
  const mime=response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()
  if(!response.ok || !mime || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) {await response.body?.cancel();throw new Error("Image unavailable")}
  const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0
  try { while(true) { const {value,done}=await reader.read();if(done) break;size+=value.length;if(size>10*1024*1024) throw new Error("Image exceeds 10 MiB");chunks.push(value) } }
  finally { await reader.cancel() }
  return sharp(Buffer.concat(chunks),{limitInputPixels:40_000_000}).resize({width:2048,height:4096,fit:"inside",withoutEnlargement:true}).webp({quality:90}).toBuffer()
}
export async function prepareMemberPhoto(member:Member):Promise<Cover|null> {
  if(!member.image || !isNotionFileUrl(member.image)) return null
  const image=await sharp(await notionImage(member.image)).resize({width:640,height:960,fit:"inside",withoutEnlargement:true}).webp({quality:88}).toBuffer({resolveWithObject:true})
  const url=await saveImage(member.id,image.data)
  return {url,previewUrl:url,width:image.info.width,height:image.info.height}
}
export async function prepareBody(env:Env,item:ContentItem,origin:string,dependencies={save:saveImage}) {
  let count=0
  async function read(id:string,depth=0):Promise<ContentBlock[]> {
    if(depth>8) throw new Error("Body nesting limit exceeded")
    const result:ContentBlock[]=[],cursors=new Set<string>();let cursor:string|null=null
    do {
      const query:URLSearchParams=new URLSearchParams({page_size:"100",...(cursor?{start_cursor:cursor}:{})})
      const batch:{results:ContentBlock[];has_more:boolean;next_cursor:string|null}|null=await notion(env,`blocks/${id}/children?${query}`)
      if(!batch) throw new Error("Body removed during preparation")
      for(const original of batch.results) {
        if(original.archived || original.in_trash) continue
        if(++count>500) throw new Error("Body exceeds 500 blocks")
        const block:ContentBlock={id:original.id,type:original.type,[original.type]:original[original.type]}
        if(original.has_children && children.has(original.type)) block.children=await read(original.id,depth+1)
        if(block.type==="image") {
          const value=blockValue(block),url=fileUrl(value)
          // A newly introduced upload host must never silently publish an
          // expiring URL. Keep the last prepared body and retry for inspection.
          if(value.type==="file" && (!url || !isNotionFileUrl(url))) throw new Error("Unsupported Notion image host")
          if(url && isNotionFileUrl(url)) {
            const path=await dependencies.save(item.id,await notionImage(url))
            block.image={type:"external",external:{url:new URL(path,origin).href},caption:value.caption}
          } else if (url && cmsImageUrl(url) !== url) {
            block.image={type:"external",external:{url:cmsImageUrl(url)},caption:value.caption}
          }
        }
        if(["file","pdf","video","audio"].includes(block.type)) {
          const value=blockValue(block),url=fileUrl(value)
          if(url && isNotionFileUrl(url)) block[block.type]={type:"external",external:{url:new URL(`/api/content/${item.kind}/${item.id}/block-file?block=${block.id.replaceAll('-','')}`,origin).href},caption:value.caption,name:value.name}
        }
        result.push(block)
      }
      cursor=batch.has_more?batch.next_cursor:null
      if(batch.has_more && (!cursor || cursors.has(cursor))) throw new Error("Repeated CMS cursor")
      if(cursor) cursors.add(cursor)
    } while(cursor)
    return result
  }
  const blocks=await read(item.id)
  if(Buffer.byteLength(JSON.stringify(blocks))>55_000) throw new Error("Prepared body exceeds 55 KiB; split this notice into shorter posts")
  return blocks
}
export async function prepareCover(item:ContentItem,previous?:Cover|null,dependencies={download:downloadPdfForPreview,render:renderFirstPage,save:saveImage}):Promise<Cover|null> {
  const pdf=getPdfSources(item)[0]
  if(!pdf || item.kind!=="research") return null
  const key=sourceKey(item)!
  const path=new RegExp(`^/report-covers/${item.id}/[a-f0-9]{64}\\.webp$`)
  // A Drive file may be replaced without changing its URL. Compare the actual
  // PDF bytes on the publishing runner, never during a visitor request.
  const data=await dependencies.download(pdf.url)
  const pdfHash=createHash("sha256").update(data).digest("hex")
  if(previous?.pdfHash===pdfHash && path.test(previous.url) && path.test(previous.previewUrl)) return {...previous,sourceKey:key}
  const png=await dependencies.render(data)
  const large=await sharp(png).webp({quality:94}).toBuffer({resolveWithObject:true})
  const small=await sharp(png).resize({width:720,withoutEnlargement:true}).webp({quality:82}).toBuffer()
  return {url:await dependencies.save(item.id,small),previewUrl:await dependencies.save(item.id,large.data),width:large.info.width,height:large.info.height,sourceKey:key,pdfHash}
}
