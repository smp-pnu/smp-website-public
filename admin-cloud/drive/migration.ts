import { Buffer } from 'node:buffer'
import { HttpError } from '../../admin-server/validation'
import { CloudStore } from '../store'
import { ReportVersions } from '../report-versions'
import { chunkBytes, sha256 } from '../protocol'
import { guardedBatch } from '../transaction'
import type { DriveUploads } from './uploads'

// Copy in bounded, resumable chunks; keep the source until Drive confirms the
// complete file checksum. Publication IDs, version bindings and PDF identity stay unchanged.
export class DriveMigration {
  constructor(readonly drive:DriveUploads){}
  async source(assetId:string) {
    const db=this.drive.db
    const binding=await db.prepare('SELECT report_id FROM report_file_bindings WHERE asset_id=?').bind(assetId).all<{report_id:string}>()
    if(binding.results.length!==1)throw new HttpError(409,'현재 원본 하나에 연결된 파일만 이전할 수 있어요.')
    const id=binding.results[0].report_id, row=await new CloudStore(db,this.drive.now).get(id),file=await new ReportVersions(db).binding(id)
    if(!file||file.id!==assetId||file.identity!==row.hash||file.state!=='ready')throw new HttpError(409,'원본 연결이 변경됐어요. 다시 확인해 주세요.')
    return {row,file}
  }
  async start(assetId:string,input:unknown) {
    const {row,file}=await this.source(assetId)
    if(file.provider==='drive')return {done:true,parts:0}
    await this.drive.begin(row,input)
    return {done:false,parts:Math.ceil(row.pdf_bytes/chunkBytes)}
  }
  async copy(assetId:string,part:number) {
    const {row,file}=await this.source(assetId)
    if(file.provider==='drive')return {done:true}
    if(!Number.isSafeInteger(part)||part<0||part>=Math.ceil(row.pdf_bytes/chunkBytes))throw new HttpError(400,'파일 조각 번호를 확인해 주세요.')
    const chunk=await this.drive.db.prepare("SELECT data,hash,bytes FROM chunks WHERE object_id=? AND kind='pdf' AND part=?").bind(row.id,part).first<{data:string;hash:string;bytes:number}>()
    if(!chunk)throw new HttpError(409,'기존 원본을 읽지 못했어요.')
    const bytes=new Uint8Array(Buffer.from(chunk.data,'base64'))
    if(bytes.length!==chunk.bytes||await sha256(bytes)!==chunk.hash)throw new HttpError(409,'기존 원본 검증에 실패했어요. 원본은 유지됩니다.')
    await this.drive.put(row,part,bytes,chunk.hash)
    return {done:false}
  }
  async finish(assetId:string) {
    const {row,file}=await this.source(assetId),db=this.drive.db
    if(file.provider==='drive')return {done:true}
    let upload=await this.drive.row(row.id)
    await this.drive.verify(row,upload)
    upload=await this.drive.row(row.id)
    if(!upload.verified||upload.offset!==row.pdf_bytes||!upload.source_sha256)throw new HttpError(409,'Drive 원본 확인이 끝나지 않았어요.')
    await guardedBatch(db,`EXISTS(SELECT 1 FROM report_files f JOIN report_file_bindings b ON b.asset_id=f.id JOIN objects o ON o.id=b.report_id
      WHERE f.id=? AND f.provider='d1' AND f.identity=? AND o.hash=? AND o.id=?)`,[assetId,file.identity,row.hash,row.id],[
      db.prepare("UPDATE report_files SET provider='drive',file_id=?,folder_id=?,source_sha256=?,managed=1 WHERE id=?").bind(upload.file_id,upload.folder_id,upload.source_sha256,assetId),
      db.prepare("INSERT INTO report_storage(object_id,provider) VALUES(?,'drive') ON CONFLICT(object_id) DO UPDATE SET provider='drive'").bind(row.id),
      // Retain integrity proofs and bounded EOF tails, as normal Drive uploads do.
      db.prepare("UPDATE chunks SET data=CASE WHEN part>=? THEN substr(data,-2732) ELSE '' END WHERE object_id=? AND kind='pdf'").bind(Math.max(0,Math.ceil(row.pdf_bytes/chunkBytes)-2),row.id),
      db.prepare("UPDATE archived_report_chunks SET data=CASE WHEN part>=? THEN substr(data,-2732) ELSE '' END WHERE asset_id=? AND kind='pdf'").bind(Math.max(0,Math.ceil(row.pdf_bytes/chunkBytes)-2),assetId),
      db.prepare("UPDATE drive_uploads SET session_secret=NULL WHERE object_id=?").bind(row.id),
      db.prepare("DELETE FROM dashboard_snapshots WHERE key IN ('overview','drive')"),
      db.prepare('DELETE FROM storage_inventory_snapshot'),
    ])
    return {done:true}
  }
}
