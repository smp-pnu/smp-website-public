import companies from "../data/report-companies.json"
import { companyMatches, normalizeCompany } from "../lib/report-identity"
import { validDate, type Evidence, type Fields } from "./model"

export const aiFields = ["company", "ticker", "title", "date", "targetYear", "targetPrice", "upside", "author", "notRated"] as const
export type AiField = typeof aiFields[number]
export type AiCandidate = { field: AiField; value: string; quote: string; page: number }
export const aiTextLimit = 12_000 // UTF-8 bytes across at most three pages.
export const compact = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase()

// Pattern masking is not anonymization: names, addresses and unusual contacts
// still require the administrator's review in the local transmission preview.
export function maskContacts(value: string) {
  return value.normalize("NFKC")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[이메일 생략]")
    .replace(/(?<!\d)(?:\+82[ .()-]*(?:0[ .()-]*)?|0)(?:2|[1-9]\d)[ .()-]*\d{3,4}[ .()-]*\d{4}(?!\d)/g, "[연락처 생략]")
    .replace(/(?<![\d+])\+[1-9]\d{0,2}(?:[ .()-]*\d){7,12}(?!\d)/g, "[연락처 생략]")
}

export function aiPages(pages: string[]) {
  let left = aiTextLimit
  const encoder = new TextEncoder()
  return pages.slice(0, 3).map(page => {
    const clean = maskContacts(page)
    let text = ""
    for (const char of clean) { const bytes = encoder.encode(char).length; if (bytes > left) break; text += char; left -= bytes }
    return text
  })
}

// Model output is untrusted: values must have a literal, page-specific quote.
export function validateAiCandidates(raw: unknown, pages: string[]): AiCandidate[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
  const result: AiCandidate[] = []
  for (const field of aiFields) {
    const item = (raw as Record<string, unknown>)[field] as Partial<AiCandidate> | undefined
    if (!item || typeof item.value !== "string" || typeof item.quote !== "string" || !Number.isInteger(item.page)) continue
    let value = item.value.trim(), quote = item.quote.trim()
    const page = Number(item.page), source = compact(pages[page - 1] ?? "")
    if (!value || value.length > (field === "title" ? 140 : 80) || !quote || quote.length > 240 || page < 1 || page > 3 || !source.includes(compact(quote))) continue
    if (field === "date") {
      const match = value.match(/^(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})$/)
      if (!match) continue
      value = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
      if (!validDate(value) || !Array.from(quote.matchAll(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/g)).some(m => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` === value)) continue
    } else if (field === "ticker") {
      if (!/^\d{6}$/.test(value) || value === "000000" || !new RegExp(`(?<!\\d)${value}(?!\\d)`).test(compact(quote))) continue
    } else if (field === "targetPrice") {
      const labeled = quote.match(/(?:목표\s*주가|target\s*price)\s*[:：]?\s*(?:₩\s*)?(\d+(?:\s*,\s*\d{3})*)(?![\s,]*\d)/i)?.[1]
      if (!labeled || !/^(?:₩\s*)?\d[\d, ]*(?:원|KRW)?$/i.test(value) || labeled.replace(/\D/g, "") !== value.replace(/\D/g, "")) continue
      const number = Number(value.replace(/\D/g, ""))
      if (!Number.isSafeInteger(number) || number <= 0 || number > 100_000_000) continue
      value = `${number.toLocaleString("en-US")}원`
    } else if (field === "upside") {
      value = value.replace(/\s/g, "")
      const labeled = quote.match(/(?:상승\s*여력|upside)\s*[:：]?\s*([+-]?\d+(?:\s*\.\s*\d+)?\s*%)/i)?.[1]
      if (!labeled || !/^[+-]?\d+(?:\.\d+)?%$/.test(value) || compact(labeled) !== compact(value)) continue
    } else if (field === "targetYear") {
      const labeled = quote.match(/(?:목표\s*연도|타겟\s*(?:연도|년도)|target\s*year)\s*[:：]?\s*(20\d{2})(?!\d)/i)?.[1]
      if (!labeled || labeled !== value) continue
    } else if (field === "notRated") {
      if (compact(value) !== "notrated" || !/not\s*rated/i.test(quote)) continue
      value = "Not Rated"
    } else if (!compact(quote).includes(compact(value))) continue
    if (/[<>\u0000-\u001f]/.test(value)) continue
    result.push({ field, value, quote, page })
  }
  // A six-digit price cannot stand in for a stock code. Require a marked code
  // next to the company in the same source heading, or a known matching pair.
  const company = result.find(c => c.field === "company"), ticker = result.find(c => c.field === "ticker")
  if (company && ticker) {
    const source = compact(pages[company.page - 1] ?? ""), name = compact(company.value), code = ticker.value
    const at = source.indexOf(name), heading = at < 0 ? "" : source.slice(at + name.length, at + name.length + 50)
    const marked = heading.match(/^\((?:(?:ks|kq|kospi|kosdaq)[.:]?)?(\d{6})(?:(?:ks|kq|kospi|kosdaq))?\)/)?.[1] === code
    const record = companies.find(c => c.ticker === code)
    const known = record && companyMatches(record, company.value)
    if (company.page !== ticker.page || !marked && !known || record && !known) return result.filter(c => !["company", "ticker"].includes(c.field))
  } else return result.filter(c => !["company", "ticker"].includes(c.field))
  return result
}

export function mergeAiFields(base: { fields: Fields; evidence: Evidence[]; warnings: string[] }, candidates: AiCandidate[], filename: string) {
  const fields = { ...base.fields }, evidence = [...base.evidence], warnings = [...base.warnings]
  const fallbackTitle = filename.replace(/\.pdf$/i, "").replace(/_+/g, " ").trim()
  const company = candidates.find(c => c.field === "company"), ticker = candidates.find(c => c.field === "ticker")
  const identityConflict = fields.reportType === "산업분석" || company && fields.company && normalizeCompany(fields.company) !== normalizeCompany(company.value)
    || ticker && fields.ticker && fields.ticker !== ticker.value
  if (identityConflict && fields.reportType !== "산업분석") warnings.push("AI가 찾은 기업 정보와 기존 입력이 달라 기존 값을 유지했어요. 원문을 확인해 주세요.")
  for (const item of candidates) {
    const { field, value } = item
    if (["company", "ticker"].includes(field) && identityConflict) continue
    if (field === "notRated") {
      if (fields.targetPrice || candidates.some(c => c.field === "targetPrice")) continue
      fields.notRated = true
      fields.upside = ""
    } else {
      if (["targetPrice", "upside"].includes(field) && fields.notRated) continue
      if (fields[field] && !(field === "title" && fields.title === fallbackTitle)) continue
      fields[field] = value
    }
    evidence.push({ field, source: "AI 추출 · PDF 근거 확인 · 관리자 검토 필요", excerpt: item.quote, page: item.page })
  }
  if (!fields.industry && fields.company && fields.ticker) {
    const record = companies.find(c => c.ticker === fields.ticker && companyMatches(c, fields.company))
    if (record) fields.industry = record.industry
  }
  return { fields, evidence: evidence.slice(-40), warnings: warnings.filter(w => !(fields.company && fields.ticker && w.startsWith("분석 대상 기업·종목코드"))
    && !(fields.date && w.startsWith("발표일을 확정")) && !((fields.targetPrice || fields.notRated) && w.startsWith("목표주가를 찾지"))).slice(0, 20) }
}
