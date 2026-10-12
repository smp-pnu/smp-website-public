import records from "../data/report-ai-summaries.json"
import { REPORT_AI_PILOT_IDS, validReportAiSummary, publicAiSummary, type ReportAiSummary } from "./report-ai-summary"

// Only reviewed pilot records ship. Generation code and provider credentials
// never enter the visitor Worker or browser bundle.
export function approvedReportSummary(id: string, pdfHash: unknown, candidates: unknown[] = records) {
  if (!(REPORT_AI_PILOT_IDS as readonly string[]).includes(id) || typeof pdfHash !== "string") return null
  const record = candidates.find((candidate): candidate is ReportAiSummary => validReportAiSummary(candidate)
    && candidate.reportId === id && candidate.pdfHash === pdfHash && candidate.reviewedAt !== null)
  return record ? publicAiSummary(record) : null
}
