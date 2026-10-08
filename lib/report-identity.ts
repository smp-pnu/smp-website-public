import type { CompanyRecord } from "./company-lookup"

export type IdentityInput = { title: string; company?: string; ticker?: string; industry?: string; category?: string; reportType?: string }
export const normalizeCompany = (name: string) => name.normalize("NFKC").replace(/주식회사|\(주\)|[\s·.,_-]/g, "").toLocaleLowerCase()
export function titleCompany(title: string) {
  const name = title.match(/^\[([^\]]+)\]/)?.[1].trim() ?? ""
  return /^\d{4}[-–.]\s?[12]$/.test(name) ? "" : name
}
export function isIndustryReport(input: IdentityInput) { return input.reportType === "산업분석" || input.category === "산업분석" }
export function companyMatches(record: CompanyRecord, name: string) {
  return [record.company, ...(record.aliases ?? [])].some(value => normalizeCompany(value) === normalizeCompany(name))
}
export function knownCompany(input: IdentityInput, companies: CompanyRecord[]) {
  const name = input.company || titleCompany(input.title)
  // Explicit fields are constraints. Conflicting names/codes require review.
  const matches = companies.filter(record => (!input.ticker || record.ticker === input.ticker)
    && (!name || companyMatches(record, name)))
  return (name || input.ticker) && matches.length === 1 ? matches[0] : null
}

// Ordinary six-digit prices/dates/phone fragments must never become tickers.
// Only codes marked as securities or paired with a name are candidates.
export function pdfTickerCandidates(text: string) {
  const pairs: { ticker: string; name: string }[] = []
  const sample = text.slice(0, 30_000)
  for (const match of sample.matchAll(/([가-힣A-Za-z][가-힣A-Za-z0-9& ._-]{0,60})\s*[（(]\s*(\d{6})(?:\s*[,.]?\s*(?:KS|KQ|KOSPI|KOSDAQ))?\s*[)）]/g)) {
    pairs.push({ ticker: match[2], name: match[1].trim() })
  }
  for (const match of sample.matchAll(/(?:종목\s*코드|Ticker|Stock\s*Code)\s*[:：]?\s*(\d{6})\b/gi)) {
    pairs.push({ ticker: match[1], name: "" })
  }
  return pairs.filter((pair, index) => pair.ticker !== "000000" && pairs.findIndex(other => other.ticker === pair.ticker) === index).slice(0, 4)
}

export async function resolveReportIdentity(input: IdentityInput, deps: {
  companies: CompanyRecord[]
  lookup: (ticker: string) => Promise<CompanyRecord | null>
  readPdf: () => Promise<string>
}): Promise<{ record: CompanyRecord | null; reason: string }> {
  if (isIndustryReport(input)) return { record: null, reason: "산업 리포트에는 단일 기업명·종목코드를 입력하지 않습니다." }
  if (input.ticker && !/^\d{6}$/.test(input.ticker)) return { record: null, reason: "종목코드는 앞자리 0을 포함한 6자리로 확인해 주세요." }
  const name = input.company || titleCompany(input.title)
  const known = knownCompany(input, deps.companies)
  if (known) {
    const fresh = known.historical ? null : await deps.lookup(known.ticker)
    return { record: fresh ? { ...fresh, aliases: known.aliases } : known, reason: fresh ? "종목코드·기업명 대조 및 WICS 확인" : "검증된 기존 기업정보 사용" }
  }
  if (input.ticker) {
    const record = await deps.lookup(input.ticker)
    return record && (!name || companyMatches(record, name))
      ? { record, reason: "입력한 종목코드와 기업명 대조" }
      : { record: null, reason: "기업명과 종목코드가 일치하는지 확인해 주세요." }
  }
  const text = await deps.readPdf()
  const candidates = pdfTickerCandidates(text)
  if (candidates.length !== 1) return { record: null, reason: text.trim()
    ? "PDF에서 분석 대상 종목을 하나로 확정하지 못했습니다. 기업명 또는 종목코드를 입력해 주세요."
    : "PDF가 이미지이거나 텍스트를 읽지 못했습니다. 기업명 또는 종목코드를 입력해 주세요." }
  const pair = candidates[0]
  const record = await deps.lookup(pair.ticker)
  // Require corroborating name evidence, even when the code is real.
  const sourceName = name || pair.name
  if (!record || !sourceName || !companyMatches(record, sourceName)) return { record: null, reason: "PDF의 기업명과 공식 종목코드를 대조하지 못했습니다. 직접 확인해 주세요." }
  return { record, reason: "PDF 기업명·종목코드 대조 및 WICS 확인" }
}
