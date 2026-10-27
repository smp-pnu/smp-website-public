import { Buffer } from "node:buffer"
import type { Database } from "../cloudflare/bindings"
import type { Draft } from "../admin-lab/model"
import { publicationLimits, validReport, type ApprovedReport, type ReportSnapshot } from "../admin-publication/model"
import { ContentOrderStore } from "./content-order"
import { ReportVersions } from "./report-versions"
import { sha256, chunkBytes } from "./protocol"
import { HttpError } from "../admin-server/validation"
import type { DriveUploads } from "./drive/uploads"

// Read-only adapter. Never exports draft edits, evidence, Drive IDs or grants.
export class ApprovedReportSource {
  constructor(readonly db: Database, readonly drive: Pick<DriveUploads, "read">, readonly now = Date.now()) {}
  async snapshot(): Promise<ReportSnapshot> {
    const rows = (await this.db.prepare(`SELECT v.data,f.identity,f.pdf_bytes,f.state,o.data AS current
      FROM report_releases r LEFT JOIN report_versions v ON v.report_id=r.report_id AND v.revision=r.approved_revision
      LEFT JOIN report_files f ON f.id=v.asset_id JOIN objects o ON o.id=r.report_id
      WHERE r.owner='admin-trial' AND o.status='ready'
      AND json_extract(o.data,'$.trashedAt') IS NULL
      AND NOT EXISTS(SELECT 1 FROM report_versions t WHERE t.report_id=r.report_id AND t.revision>r.approved_revision AND json_extract(t.data,'$.trashedAt') IS NOT NULL)
      ORDER BY r.report_id LIMIT ?`)
      .bind(publicationLimits.reports + 1).all<{data:string;identity:string;pdf_bytes:number;current:string;state:string}>()).results
    if (rows.length > publicationLimits.reports) throw new HttpError(409, "게시 시험 한도를 초과했어요.")
    const order = await new ContentOrderStore(this.db, "reports").order()
    const reports: ApprovedReport[] = []
    for (const row of rows) {
      if (!row.data || row.state!=="ready")throw new HttpError(503,"승인본 파일을 확인하지 못했어요.")
      const d: Draft = JSON.parse(row.data)
      if (d.approvedRevision!==d.revision || !d.approvedAt)throw new HttpError(503,"승인본 정보를 확인하지 못했어요.")
      const current: Draft = JSON.parse(row.current)
      // A restored document needs a new approval. Later edits, however, retain
      // its last approval. Detect intervening trash revisions explicitly.
      if (current.trashedAt) continue
      const r: ApprovedReport = { id:d.id.replaceAll("-", ""), revision:d.revision, approvedAt:d.approvedAt!, fields:d.fields, filename:d.filename, pages:d.pages, bytes:row.pdf_bytes, identity:row.identity }
      if (!validReport(r)) throw new HttpError(409,"승인본 데이터가 올바르지 않아요.")
      if (Date.parse(`${r.fields.date}T00:00:00+09:00`) <= this.now) reports.push(r)
    }
    const rank = new Map(order.ids.map((id,i)=>[id.replaceAll("-", ""),i]))
    reports.sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity)||a.id.localeCompare(b.id))
    return { version:1, complete:true, reports, fingerprint:await sha256(new TextEncoder().encode(JSON.stringify(reports))) }
  }
  async part(id: string, revision: number, part: number) {
    if (!/^[a-f0-9]{32}$/.test(id) || !Number.isSafeInteger(revision) || !Number.isSafeInteger(part) || part < 0) throw new HttpError(404,"승인본이 없어요.")
    const uuid = `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`
    const versions = new ReportVersions(this.db, this.now), {draft,file} = await versions.approved(uuid)
    if (draft.revision !== revision || Date.parse(`${draft.fields.date}T00:00:00+09:00`) > this.now || part >= Math.ceil(file.pdf_bytes/chunkBytes)) throw new HttpError(409,"승인본이 변경됐어요.")
    if (await this.db.prepare("SELECT 1 FROM report_versions WHERE report_id=? AND revision>? AND json_extract(data,'$.trashedAt') IS NOT NULL LIMIT 1").bind(uuid,revision).first()) throw new HttpError(409,"다시 승인이 필요해요.")
    const proof = (await versions.assetParts(file,"pdf",part))[0]
    if (!proof) throw new HttpError(503,"원본 확인 정보가 없어요.")
    const bytes = file.provider === "drive" ? await this.drive.read(file,part) : new Uint8Array(Buffer.from(proof.data,"base64"))
    if (bytes.length !== Math.min(chunkBytes,file.pdf_bytes-part*chunkBytes) || await sha256(bytes) !== proof.hash) throw new HttpError(503,"원본이 변경되었거나 손상됐어요.")
    return bytes
  }
}
