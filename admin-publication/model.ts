import type { Fields } from "../admin-lab/model"
import { emptyFields, reviewErrors } from "../admin-lab/model"
import type { ContentItem } from "../lib/content-model"

export const publicationLimits = { reports: 500, perRun: 2, perDay: 10, attempts: 3, retryMs: 15 * 60_000, leaseMs: 10 * 60_000, pdfBytes: 32 * 1024 * 1024, pages: 120, assetBytes: 256 * 1024 * 1024, assetFiles: 2000 } as const
export type ApprovedReport = {
  id: string; revision: number; approvedAt: string; fields: Fields;
  filename: string; pages: number; bytes: number; identity: string;
}
export type ReportSnapshot = { version: 1; complete: true; reports: ApprovedReport[]; fingerprint: string }
export interface ReportSource {
  snapshot(): Promise<ReportSnapshot>;
  pdf(report: ApprovedReport): Promise<Uint8Array<ArrayBuffer>>;
}
export function validReport(r: ApprovedReport) {
  return r && /^[a-f0-9]{32}$/.test(r.id) && Number.isSafeInteger(r.revision) && r.revision > 0
    && /^[a-f0-9]{64}$/.test(r.identity) && typeof r.approvedAt === "string" && Number.isFinite(Date.parse(r.approvedAt))
    && typeof r.filename === "string" && r.filename.length <= 500 && /\.pdf$/i.test(r.filename)
    && Number.isSafeInteger(r.pages) && r.pages > 0 && r.pages <= publicationLimits.pages
    && Number.isSafeInteger(r.bytes) && r.bytes >= 8 && r.bytes <= publicationLimits.pdfBytes
    && r.fields && Object.keys(r.fields).length === Object.keys(emptyFields()).length
    && Object.entries(emptyFields()).every(([key, example]) => {
      const value = r.fields[key as keyof Fields]
      return typeof example === "boolean" ? typeof value === "boolean" : typeof value === "string" && value.length <= 500
    })
    && ["기업분석", "산업분석"].includes(r.fields.reportType) && reviewErrors(r.fields).length === 0
}
export function publicReport(r: ApprovedReport, rank: number): ContentItem {
  if (!validReport(r)) throw Error("Invalid approved report")
  const f = r.fields
  return {
    id: r.id, kind: "research", title: f.title, date: f.date, editedAt: r.approvedAt,
    summary: f.notRated ? "Not Rated" : [f.targetYear && `목표년도 ${f.targetYear}`, `목표주가 ${f.targetPrice}`, f.upside && `상승여력 ${f.upside}`].filter(Boolean).join(" · "),
    company: f.company, ticker: f.ticker, industry: f.industry, semester: f.semester, semesterOrder: rank,
    author: f.author, reportType: f.reportType, category: f.reportType, categoryColor: "default", pinned: false,
    attachments: [], externalUrl: null, managedPdf: { name: r.filename, identity: r.identity },
  }
}
