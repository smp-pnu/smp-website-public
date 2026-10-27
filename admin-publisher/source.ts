import { createHash } from "node:crypto"
import { fileIdentity, chunkBytes } from "../admin-cloud/protocol"
import { publicationLimits, validReport, type ApprovedReport, type ReportSnapshot, type ReportSource } from "../admin-publication/model"

export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function validateSnapshot(input: ReportSnapshot): ReportSnapshot {
  if (input?.version !== 1 || input.complete !== true || !Array.isArray(input.reports) || input.reports.length > publicationLimits.reports
    || input.reports.some(r=>!validReport(r)) || new Set(input.reports.map(r=>r.id)).size !== input.reports.length
    || fingerprint(input.reports) !== input.fingerprint) throw Error("Incomplete or invalid approval snapshot; refusing publication or withdrawal")
  return input
}
export class HttpReportSource implements ReportSource {
  requests = 0
  constructor(readonly origin: string, readonly key: string, readonly request: typeof fetch = fetch) {
    const url = new URL(origin)
    if (url.origin !== origin || url.username || url.password || url.search || url.hash
      || !((url.protocol === "http:" && ["127.0.0.1","localhost"].includes(url.hostname)) || (url.protocol === "https:" && url.hostname === "admin.pnusmp.com"))
      || !/^[a-f0-9]{64}$/.test(key)) throw Error("Invalid publisher source")
  }
  private async read(path: string, maxBytes: number) {
    if (++this.requests > 300) throw Error("Publisher request budget exhausted")
    const response=await this.request(this.origin+path,{headers:{Authorization:`Bearer ${this.key}`},redirect:"error",signal:AbortSignal.timeout(20_000)})
    if (!response.ok || !response.body) { await response.body?.cancel(); throw Error(`Approved report source unavailable (${response.status})`) }
    const reader=response.body.getReader(), parts:Uint8Array[]=[];let total=0
    try { while(true) { const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes)throw Error("Source response exceeds budget");parts.push(value) } }
    finally { await reader.cancel() }
    return new Uint8Array(Buffer.concat(parts,total))
  }
  async snapshot() { return validateSnapshot(JSON.parse(new TextDecoder().decode(await this.read("/api/publisher/reports",4*1024*1024)))) }
  async pdf(r: ApprovedReport) {
    if (!validReport(r)) throw Error("Invalid approved report")
    const bytes=new Uint8Array(r.bytes)
    for(let offset=0;offset<r.bytes;offset+=chunkBytes) {
      const part=await this.read(`/api/publisher/reports/${r.id}/${r.revision}/pdf/${offset/chunkBytes}`,chunkBytes)
      if(part.length!==Math.min(chunkBytes,r.bytes-offset))throw Error("Incomplete PDF part")
      bytes.set(part,offset)
    }
    if (await fileIdentity(bytes)!==r.identity) throw Error("Approved PDF identity mismatch")
    return bytes
  }
}
