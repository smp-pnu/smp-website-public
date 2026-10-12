export const REPORT_AI_VERSION = 1 as const
export const REPORT_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it"
export const REPORT_AI_PILOT_IDS = [
  "9a1c6cd666f24fb2849f678802d0ebfb",
  "3ee91cacb13280a89c2ff3c7c7a486a3",
  "3ee91cacb13280c5b854ca2c87ae4239",
] as const

export type AiClaim = { text: string; sources: { page: number; quote: string }[] }
export type ReportAiSummary = {
  version: 1; reportId: string; pdfHash: string; model: string;
  generatedAt: string; reviewedAt: string | null; reportDate: string;
  documentPages: number; overview: AiClaim[]; points: AiClaim[]; risks: AiClaim[];
}
export type PublicAiClaim = { text: string; pages: number[] }
export type PublicReportAiSummary = {
  reportDate: string; documentPages: number;
  overview: PublicAiClaim[]; points: PublicAiClaim[]; risks: PublicAiClaim[];
}
const plain = (v: unknown, max: number): v is string => typeof v === "string"
  && v.trim().length > 0 && v.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v))
export const normalizeEvidence = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase()

export function validReportAiSummary(value: unknown): value is ReportAiSummary {
  if (!value || typeof value !== "object") return false
  const v = value as ReportAiSummary
  if (v.version !== REPORT_AI_VERSION || !/^[a-f0-9]{32}$/.test(v.reportId)
    || !/^[a-f0-9]{64}$/.test(v.pdfHash) || v.model !== REPORT_AI_MODEL
    || !date(v.generatedAt) || (v.reviewedAt !== null && !date(v.reviewedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(v.reportDate)
    || !Number.isInteger(v.documentPages) || v.documentPages < 1 || v.documentPages > 80) return false
  return ([['overview', 2, 3], ['points', 2, 3], ['risks', 0, 2]] as const).every(([key, min, max]) => {
    const claims = v[key]
    return Array.isArray(claims) && claims.length >= min && claims.length <= max && claims.every(claim =>
      claim && plain(claim.text, 180) && Array.isArray(claim.sources) && claim.sources.length >= 1 && claim.sources.length <= 2
      && claim.sources.every(source => source && Number.isInteger(source.page) && source.page >= 1 && source.page <= v.documentPages && plain(source.quote, 260)))
  })
}

// Quotes must occur on the specified PDF page; numeric statements must also
// appear in their evidence. This is a filter, not a substitute for pilot review.
export function validateSummaryEvidence(summary: ReportAiSummary, pages: { number: number; text: string }[]) {
  if (!validReportAiSummary(summary) || pages.length !== summary.documentPages) throw new Error("Invalid summary document")
  const source = new Map(pages.map(page => [page.number, normalizeEvidence(page.text)]))
  for (const claim of [...summary.overview, ...summary.points, ...summary.risks]) {
    for (const cite of claim.sources) {
      if (normalizeEvidence(cite.quote).length < 10 || !source.get(cite.page)?.includes(normalizeEvidence(cite.quote))) throw new Error(`Unmatched evidence on PDF page ${cite.page}`)
    }
    const evidence = normalizeEvidence(claim.sources.map(s => s.quote).join(" ")).replaceAll(",", "")
    const numbers = claim.text.replaceAll(",", "").match(/-?\d+(?:\.\d+)?%?/g) ?? []
    const citedNumbers = new Set(evidence.match(/-?\d+(?:\.\d+)?%?/g) ?? [])
    if (numbers.some(number => !citedNumbers.has(number))) throw new Error("Numeric claim is missing source evidence")
  }
}

export function publicAiSummary(summary: ReportAiSummary): PublicReportAiSummary {
  const claims = (items: AiClaim[]) => items.map(({text, sources}) => ({ text, pages: [...new Set(sources.map(s => s.page))] }))
  return { reportDate: summary.reportDate, documentPages: summary.documentPages,
    overview: claims(summary.overview), points: claims(summary.points), risks: claims(summary.risks) }
}
export function summarySections(summary: PublicReportAiSummary) {
  return [
    { key: "overview", title: "핵심 요약", claims: summary.overview },
    { key: "points", title: "투자 포인트", claims: summary.points },
    { key: "risks", title: "위험 요인", claims: summary.risks },
  ] as const
}
export const AI_SUMMARY_NOTE = "AI 초안을 PDF 원문과 대조해 편집한 요약입니다. 수치와 판단은 보고서 작성 당시 기준이며, PDF 원문을 함께 확인해주세요."
