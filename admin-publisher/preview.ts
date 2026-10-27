import type { Database } from "../cloudflare/bindings"
import type { Env } from "../free/server/types"
import type { ContentItem } from "../lib/content-model"
import type { ReaderPdf } from "../lib/report-reader"
import { readReaderChunks } from "../free/server/reader-chunks"
import { assertPreviewDatabase } from "./target"

// Only isolated preview entry points install this dependency. It cannot be enabled
// by an HTTP parameter, CMS field or production environment variable.
export async function previewReader(db:Database,assets:{fetch:typeof fetch}):Promise<NonNullable<Env["REPORT_PREVIEW"]>> {
  await assertPreviewDatabase(db)
  return {
    async published(id) {
      const row=await db.prepare("SELECT p.item,c.id AS ready FROM preview_reports p LEFT JOIN free_content c ON c.id=p.id AND c.kind='research' AND c.item=p.item AND c.body_revision=c.revision WHERE p.id=?").bind(id).first<{item:string;ready:string|null}>()
      // Unowned records continue through the existing Notion publication check.
      return !row?undefined:row.ready?JSON.parse(row.item) as ContentItem:null
    },
    async pdf(request,item) {
      const row=await db.prepare("SELECT item,cover,original FROM preview_reports WHERE id=?").bind(item.id).first<{item:string;cover:string;original:string}>()
      const missing=()=>new Response("Not found",{status:404})
      if(!row||JSON.parse(row.item).managedPdf?.identity!==item.managedPdf?.identity)return missing()
      const url=new URL(request.url),cover=JSON.parse(row.cover),pdf:ReaderPdf=JSON.parse(row.original)
      if((url.searchParams.has("edition")&&url.searchParams.get("edition")!==item.managedPdf?.identity)
        || (url.searchParams.has("index")&&url.searchParams.get("index")!=="0") || url.searchParams.has("source"))return missing()
      const prepared=url.searchParams.get("prepared"),pack=url.searchParams.get("pages")
      if(prepared && prepared!==cover.pdfHash)return missing()
      if(url.searchParams.has("pages")) {
        if(!pack||!prepared||!cover.reader?.pagePack?.url.endsWith(`/${pack}.pack`)||request.headers.has("range"))return missing()
        const value=await assets.fetch(new Request(new URL(cover.reader.pagePack.url,url)))
        const type=value.headers.get("content-type")?.split(";")[0]
        if(value.status!==200||!value.body||(type&&type!=="application/octet-stream")
          ||(value.headers.has("content-length")&&Number(value.headers.get("content-length"))!==cover.reader.pagePack.bytes)) {
          await value.body?.cancel();return missing()
        }
        // Assets may omit the type/length of an unknown .pack extension. The
        // reader requires these headers before its own full hash verification.
        return new Response(value.body,{headers:{"Content-Type":"application/octet-stream","Content-Length":String(cover.reader.pagePack.bytes),"Content-Security-Policy":"sandbox","Cache-Control":"no-store"}})
      }
      // Keep the native Fetcher as the receiver. Copying its fetch method to a
      // plain object works with local arrow-function mocks but fails in workerd.
      const response=await readReaderChunks(request,pdf,{CMS_DB:db,ASSETS:assets})
      if(!response)return missing()
      const headers=new Headers(response.headers)
      headers.set("Content-Disposition",`${url.searchParams.get("download")==="1"?"attachment":"inline"}; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(item.managedPdf!.name)}`)
      headers.set("Content-Security-Policy","sandbox");headers.set("Cache-Control","no-store")
      return new Response(response.body,{status:response.status,headers})
    },
  }
}
