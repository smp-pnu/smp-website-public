import { mkdir, readFile, writeFile, rename, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import sharp from "sharp"
import { renderReaderPackPages } from "../lib/pdf-preview-render"
import { encodePagePack, pagePackMaxBytes, type PackedPage } from "../lib/pdf-page-pack"
import { preparedReader, readerPdfChunkBytes, readerPdfParts, type ReaderPdf } from "../lib/report-reader"
import { sourceKey } from "../lib/cover-metadata"
import type { Cover } from "../free/jobs/prepare"
import { publicationLimits, publicReport, type ApprovedReport } from "../admin-publication/model"
import { fileIdentity } from "../admin-cloud/protocol"

export type PreparedEdition = { cover: Cover; original: ReaderPdf }
const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex")
const assetPattern = /^\/(report-covers|_reader-pdfs)\/[a-f0-9]{32}\/[a-f0-9]{64}\.(webp|pack|\d{4}\.bin)$/
// This store is deliberately separate from .smp-cache and deployable dist/.
export class LocalPublicationAssets {
  bytes = 0; files = 0
  constructor(readonly root: string) {
    if (!path.isAbsolute(root) || path.resolve(root) !== root || root === "/" || /\/(?:dist|public|\.smp-cache)(?:\/|$)/.test(root)) throw Error("Use a separate absolute preview asset directory")
  }
  async init() {
    await mkdir(this.root,{recursive:true,mode:0o700})
    const scan=async(dir:string):Promise<void>=>{ for(const e of await readdir(dir,{withFileTypes:true})) {
      if(e.isSymbolicLink())throw Error("Symlink not allowed in preview assets")
      const file=path.join(dir,e.name)
      if(e.isDirectory())await scan(file);else {this.bytes+=(await stat(file)).size;this.files++}
    } }
    this.bytes=0;this.files=0;await scan(this.root)
    this.check(0,0)
  }
  private file(url: string) { if(!assetPattern.test(url))throw Error("Invalid asset path");return path.join(this.root,url) }
  private check(bytes:number,files:number) {
    if(this.bytes+bytes>publicationLimits.assetBytes || this.files+files>publicationLimits.assetFiles)throw Error("Preview asset budget exhausted; existing publication retained")
  }
  async put(url:string,bytes:Uint8Array) {
    const file=this.file(url)
    try { const prior=await readFile(file);if(!prior.equals(Buffer.from(bytes)))throw Error("Immutable asset collision");return }
    catch(e) { if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e }
    this.check(bytes.length,1)
    await mkdir(path.dirname(file),{recursive:true,mode:0o700})
    const temp=file+`.${crypto.randomUUID()}.tmp`
    await writeFile(temp,bytes,{mode:0o600,flag:"wx"});await rename(temp,file)
    this.bytes+=bytes.length;this.files++
  }
  async get(url:string) { return readFile(this.file(url)) }
  fetch:typeof fetch = async(input) => {
    const url=new URL(input instanceof Request?input.url:String(input))
    try {
      const bytes=await this.get(url.pathname)
      return new Response(bytes,{headers:{"Content-Type":url.pathname.endsWith(".webp")?"image/webp":"application/octet-stream","Content-Length":String(bytes.length)}})
    } catch { return new Response("Not found",{status:404}) }
  }
  async verify(r:ApprovedReport,edition:PreparedEdition) {
    const cover=edition.cover,reader=preparedReader(r.id,cover.reader)
    if (!reader?.pagePack || reader.pageCount!==r.pages || !reader.pdf || reader.source?.bytes!==r.bytes || edition.original.bytes!==r.bytes)throw Error("Incomplete prepared edition")
    const original=preparedReader(r.id,{...cover.reader,pdf:edition.original})?.pdf
    if(!original || JSON.stringify(reader.pdf)!==JSON.stringify(original))throw Error("Reader and original PDF metadata differ")
    for(const url of new Set([cover.url,cover.previewUrl,...reader.pages.map(p=>p.url),reader.pagePack.url])) {
      if(!url.startsWith(`/report-covers/${r.id}/`)&&!url.startsWith(`/_reader-pdfs/${r.id}/`))throw Error("Foreign asset")
      const bytes=await this.get(url)
      if(digest(bytes)!==path.basename(url).split(".")[0])throw Error("Prepared asset integrity mismatch")
    }
    const parts=await Promise.all(readerPdfParts(edition.original).map(p=>this.get(p.url)))
    const pdf=new Uint8Array(Buffer.concat(parts))
    if(pdf.length!==r.bytes || digest(pdf)!==cover.pdfHash || await fileIdentity(pdf)!==r.identity)throw Error("Prepared PDF integrity mismatch")
  }
}

// One sequential rendering pass: the first three images are both preview
// pages and members of the complete pack. Never runs inside a visitor Worker.
export async function prepareApprovedPdf(r:ApprovedReport,data:Uint8Array<ArrayBuffer>,assets:LocalPublicationAssets):Promise<PreparedEdition> {
  if(data.length!==r.bytes || await fileIdentity(data)!==r.identity || !Buffer.from(data.subarray(0,5)).equals(Buffer.from("%PDF-")))throw Error("Approved PDF integrity mismatch")
  const hash=digest(data),modified=new Date(r.approvedAt).toUTCString(),checkedAt=Date.now()
  const original:ReaderPdf={url:`/_reader-pdfs/${r.id}/${hash}.pdf`,bytes:data.length,chunkSize:readerPdfChunkBytes,initialChunks:[0],sourceBytes:data.length,sourceModified:modified,checkedAt}
  const packed:PackedPage[]=[],pages:{page:number;url:string;width:number;height:number}[]=[]
  let small:Uint8Array|undefined,total=0
  await renderReaderPackPages(data,async p=>{
    if(p.page>publicationLimits.pages)throw Error("Report page budget exhausted")
    const bytes=await sharp(p.png).webp({quality:94}).toBuffer()
    total+=bytes.length
    if(total>pagePackMaxBytes-16396)throw Error("Complete reader pack exceeds budget")
    packed.push({page:p.page,width:p.width,height:p.height,data:bytes})
    if(p.page<=3) {
      const url=`/report-covers/${r.id}/${digest(bytes)}.webp`
      await assets.put(url,bytes);pages.push({page:p.page,url,width:p.width,height:p.height})
      if(p.page===1)small=await sharp(p.png).resize({width:720,withoutEnlargement:true}).webp({quality:82}).toBuffer()
    }
  })
  if(packed.length!==r.pages || !small)throw Error("PDF page count differs from approved metadata")
  const pack=encodePagePack(packed),packUrl=`/_reader-pdfs/${r.id}/${digest(pack)}.pack`,coverUrl=`/report-covers/${r.id}/${digest(small)}.webp`
  await assets.put(packUrl,pack);await assets.put(coverUrl,small)
  for(const p of readerPdfParts(original))await assets.put(p.url,data.subarray(p.start,p.start+p.bytes))
  const cover:Cover={url:coverUrl,previewUrl:pages[0].url,width:pages[0].width,height:pages[0].height,sourceKey:sourceKey(publicReport(r,1))!,pdfHash:hash,
    reader:{version:1,pageCount:r.pages,pages,pagePackVersion:2,pagePack:{url:packUrl,bytes:pack.length},pdf:original,source:{key:hash,bytes:data.length,modified,checkedAt}}}
  return {cover,original}
}
