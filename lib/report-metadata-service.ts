import "server-only"
import { createHash } from "node:crypto"
import companies from "../data/report-companies.json"
import { normalizeId, plainText, fileUrl, safeUrl, type NotionPage } from "./content-model"
import { notionRequest } from "./notion-request"
import { getPdfSources } from "./pdf-source"
import { lookupCompany } from "./company-lookup"
import { isIndustryReport, resolveReportIdentity, type IdentityInput } from "./report-identity"
import { canonicalIndustry, notionIndustry } from "./wics"

type Metadata = IdentityInput & { pdf: string; source: string }
export function metadataInput(page: NotionPage): Metadata {
  const p = page.properties
  const files = { title: plainText(p.제목?.title), externalUrl: safeUrl(p["외부 링크"]?.url),
    attachments: (p.첨부파일?.files ?? []).flatMap(file => { const url = fileUrl(file); return url ? [{ name: file.name ?? "", url }] : [] }),
  }
  const pdf = getPdfSources(files)[0]?.url ?? ""
  // Signed Notion URLs change even when the underlying PDF has not changed.
  const source = pdf ? new URL(pdf) : null
  if (source && source.hostname !== "drive.usercontent.google.com") source.search = ""
  return { title: files.title, company: plainText(p.기업명?.rich_text).trim(), ticker: plainText(p.종목코드?.rich_text).trim(),
    industry: p.업종?.select?.name ?? "", category: p.분류?.select?.name, reportType: p["보고서 종류"]?.select?.name,
    pdf, source: source?.href ?? "",
  }
}
export function metadataKey(input: Metadata) {
  const { pdf: _pdf, ...stable } = input
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}
export function metadataNote(existing: string, reason: string) {
  const kept = existing.split("\n").filter(line => !line.startsWith("[기업정보] ")).join("\n").trim()
  return [kept, `[기업정보] ${reason}`].filter(Boolean).join("\n")
}
export function textProperty(text: string) {
  return { rich_text: Array.from({ length: Math.ceil(text.length / 1900) }, (_, i) => ({ type: "text", text: { content: text.slice(i * 1900, (i + 1) * 1900) } })) }
}
export function scopedReport(page: NotionPage, id: string) {
  const source = normalizeId(process.env.NOTION_REPORTS_DATA_SOURCE_ID ?? "")
  return !!source && page.object === "page" && normalizeId(page.id) === id && !page.archived && !page.in_trash
    && page.parent?.type === "data_source_id" && normalizeId(page.parent.data_source_id ?? "") === source
}
const pending = new Map<string, Promise<string>>()
let active = 0
export async function syncReportMetadata(rawId: string) {
  if (process.env.NOTION_METADATA_WRITE_ENABLED !== "true") return "disabled"
  const id = normalizeId(rawId)
  if (!id) return "ignored"
  const existing = pending.get(id)
  if (existing) return existing
  // Avoid parallel PDF downloads exhausting a function instance's memory.
  if (active >= 2) throw new Error("Metadata preparation busy")
  active++
  const work = sync(id)
  pending.set(id, work)
  try { return await work } finally { active--; pending.delete(id) }
}
async function sync(id: string) {
  const page = await notionRequest<NotionPage>(`pages/${id}`)
  if (!scopedReport(page, id)) return "ignored"
  const input = metadataInput(page)
  if (!input.title || (!input.pdf && !input.company && !input.ticker)) return "waiting"
  const key = metadataKey(input)
  if (plainText(page.properties["기업정보 동기화키"]?.rich_text) === key) return "unchanged"
  // Unknown schema should fail before any write, rather than changing unrelated properties.
  if (page.properties["기업정보 상태"]?.type !== "select" || page.properties["기업정보 동기화키"]?.type !== "rich_text") throw new Error("Metadata properties not configured")
  let status = "직접 입력", reason = "직접 입력한 기업정보를 유지합니다."
  const values: Partial<Pick<Metadata, "company" | "ticker" | "industry">> = {}
  if (isIndustryReport(input)) { status = "산업 리포트"; reason = "산업 리포트의 업종은 관리자가 지정합니다. 단일 기업정보는 자동 입력하지 않습니다." }
  else if (!input.company || !input.ticker || !input.industry) {
    const result = await resolveReportIdentity(input, { companies, lookup: lookupCompany,
      readPdf: async () => input.pdf ? (await import("./report-pdf-text")).readReportPdfText(input.pdf) : "",
    })
    reason = result.reason
    if (result.record) {
      status = "자동 입력"
      if (!input.company) values.company = result.record.company
      if (!input.ticker) values.ticker = result.record.ticker
      if (!input.industry) values.industry = notionIndustry(canonicalIndustry(result.record.industry) ?? result.record.industry)
    } else status = "확인 필요"
  }
  // Recheck scope/source/fields after extraction, and merge notes from the latest
  // page. Never overwrite a manager's input or resurrect an archived page.
  const latest = await notionRequest<NotionPage>(`pages/${id}`)
  if (!scopedReport(latest, id)) return "ignored"
  if (metadataKey(metadataInput(latest)) !== key) throw new Error("Report changed during metadata preparation")
  const properties: Record<string, unknown> = {
    "기업정보 상태": { select: { name: status } },
    "기업정보 동기화키": textProperty(metadataKey({ ...input, ...values })),
    "검토 메모": textProperty(metadataNote(plainText(latest.properties["검토 메모"]?.rich_text), reason)),
    ...(values.company ? { 기업명: textProperty(values.company) } : {}),
    ...(values.ticker ? { 종목코드: textProperty(values.ticker) } : {}),
    ...(values.industry ? { 업종: { select: { name: values.industry } } } : {}),
  }
  await notionRequest(`pages/${id}`, { properties }, "PATCH")
  return status
}
