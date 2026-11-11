import type { Database } from "../cloudflare/bindings"
import type { FileInventory, InventoryFile, FileReference } from "../admin-lab/file-inventory-model"
import { validFileId } from "./drive/connection"

type Source = { id:string; title:string|null; url:string|null; identity:string|null; upload:string|null; bytes:number|null; name:string|null; usage:FileReference['usage'] }
type Stored = { id:string; name:string; identity:string; bytes:number; provider:'d1'|'drive'; file_id:string|null; state:string; delete_after:number|null; upload:string|null; bindings:number }
function driveId(value:string|null) {
  if(!value) return null
  try { const u=new URL(value); if(u.protocol!=='https:'||u.hostname!=='drive.google.com') return null
    const id=u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1]??u.searchParams.get('id'); return id&&validFileId(id)?id:null
  } catch {return null}
}
const size=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:null
const priority={public:0,approved:1,draft:2,trash:3,history:4}
export function combineInventory(stored:Stored[], sources:Source[]):FileInventory {
  const files=new Map<string,InventoryFile>(), identities=new Map<string,string>(), uploads=new Map<string,string>(), drives=new Map<string,string>()
  for(const f of stored) {
    const key=`asset:${f.id}`
    files.set(key,{id:key,name:f.name,bytes:size(f.bytes),provider:f.provider,driveId:f.file_id&&validFileId(f.file_id)?f.file_id:null,
      state:f.state==='pending-delete'?'retained':'unlinked',deleteAfter:f.delete_after,references:[],
      migrateUpload:f.provider==='d1'&&f.state==='ready'&&f.bindings===1?f.upload:null,assetId:f.id})
    identities.set(f.identity,key); if(f.upload)uploads.set(f.upload,key);if(f.file_id)drives.set(f.file_id,key)
  }
  for(const source of [...sources].sort((a,b)=>priority[a.usage]-priority[b.usage])) {
    if(!/^[a-f0-9]{32}$/.test(source.id))continue
    const drive=driveId(source.url), key=(source.identity&&identities.get(source.identity))||(source.upload&&uploads.get(source.upload))||(drive&&drives.get(drive))||(drive?`drive:${drive}`:null)
    if(!key)continue
    let file=files.get(key)
    if(!file) { file={id:key,name:source.name||source.title||'PDF 원본',bytes:size(source.bytes),provider:'drive',driveId:drive,state:'unlinked',deleteAfter:null,references:[],migrateUpload:null,assetId:null};files.set(key,file);if(drive)drives.set(drive,key) }
    if(file.bytes===null)file.bytes=size(source.bytes)
    // Only publish metadata, never authoring bodies, OAuth tokens or export grants.
    if(!file.references.some(r=>r.id===source.id&&r.usage===source.usage))file.references.push({id:source.id,title:source.title||'제목 없는 리포트',usage:source.usage})
  }
  for(const f of files.values()) {
    const usages=f.references.map(r=>r.usage)
    if(usages.includes('public'))f.state='public'
    else if(usages.some(u=>u==='draft'||u==='approved'))f.state='private'
    else if(usages.length)f.state='retained'
    if(f.references.length)f.name=f.references[0].title
  }
  const items=[...files.values()].sort((a,b)=>(b.bytes??-1)-(a.bytes??-1)||a.id.localeCompare(b.id))
  return {files:items,totalBytes:items.reduce((n,f)=>n+(f.bytes??0),0),unknown:items.filter(f=>f.bytes===null).length,publicFiles:items.filter(f=>f.state==='public').length}
}
export async function fileInventory(admin:Database,cms:Database) {
  const fields=(payload:string)=>`json_extract(${payload},'$.item.title') title,json_extract(${payload},'$.item.externalUrl') url,
    coalesce(json_extract(${payload},'$.item.managedPdf.identity'),json_extract(${payload},'$.upload.report.identity')) identity,
    json_extract(${payload},'$.upload.id') upload,
    coalesce(json_extract(${payload},'$.upload.report.bytes'),json_extract(${payload},'$.cover.reader.source.bytes'),json_extract(${payload},'$.cover.reader.pdf.sourceBytes')) bytes,
    json_extract(${payload},'$.item.managedPdf.name') name`
  const [stored,sources]=await Promise.all([
    admin.prepare(`SELECT f.id,f.identity,f.pdf_bytes bytes,f.provider,f.file_id,f.state,f.delete_after,
      (SELECT report_id FROM report_file_bindings WHERE asset_id=f.id LIMIT 1) upload,
      (SELECT count(*) FROM report_file_bindings WHERE asset_id=f.id) bindings,
      coalesce((SELECT json_extract(o.data,'$.filename') FROM objects o JOIN report_file_bindings b ON b.report_id=o.id WHERE b.asset_id=f.id LIMIT 1),
        (SELECT json_extract(v.data,'$.filename') FROM report_versions v WHERE v.asset_id=f.id LIMIT 1),'이전 PDF 원본') name
      FROM report_files f WHERE f.state<>'deleted'`).all<Stored>(),
    cms.prepare(`SELECT id,json_extract(item,'$.title') title,json_extract(item,'$.externalUrl') url,json_extract(item,'$.managedPdf.identity') identity,
      NULL upload,coalesce(json_extract(cover,'$.reader.source.bytes'),json_extract(cover,'$.reader.pdf.sourceBytes')) bytes,
      json_extract(item,'$.managedPdf.name') name,'public' usage FROM free_content WHERE kind='research'
      UNION ALL SELECT id,${fields('draft')},CASE WHEN trashed_at IS NULL THEN 'draft' ELSE 'trash' END usage FROM cms_entries WHERE kind='research'
      UNION ALL SELECT id,${fields('approved')},'approved' usage FROM cms_entries WHERE kind='research' AND trashed_at IS NULL AND approved IS NOT NULL
      UNION ALL SELECT h.id,${fields('h.payload')},'history' usage FROM cms_history h JOIN cms_entries e ON e.id=h.id WHERE e.kind='research'
      UNION ALL SELECT j.id,${fields('j.payload')},'approved' usage FROM cms_jobs j JOIN cms_entries e ON e.id=j.id WHERE e.kind='research'`).all<Source>(),
  ])
  return combineInventory(stored.results,sources.results)
}
