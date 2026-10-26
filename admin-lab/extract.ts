import companies from "../data/report-companies.json"
import { companyMatches, pdfTickerCandidates, titleCompany } from "../lib/report-identity"
import { publicReportAuthor } from "../lib/research-metadata"
import { emptyFields, validDate, type Evidence, type Fields } from "./model"

export function extractFields(filename: string, pages: string[]) {
  const fields = emptyFields()
  const evidence: Evidence[] = []
  const warnings: string[] = []
  const title = filename.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim()
  fields.title = title
  evidence.push({ field: "title", source: "파일명 · 직접 수정 가능", excerpt: title })
  const text = pages.join("\n")
  const add = (field: keyof Fields, pattern: RegExp) => {
    for (const [index, page] of pages.entries()) {
      const match = page.match(pattern)
      if (!match) continue
      const value = match[1].trim()
      evidence.push({ field, source: "PDF 원문", excerpt: match[0].slice(0, 180), page: index + 1 })
      return value
    }
    return ""
  }
  fields.reportType = /산업\s*(?:분석|리포트)/.test(title) ? "산업분석" : "기업분석"
  if (fields.reportType === "기업분석") {
    const filenameCompany = titleCompany(title)
    const candidates = pdfTickerCandidates(text)
    const matches = companies.filter(company => (!filenameCompany || companyMatches(company, filenameCompany)) &&
      (filenameCompany || candidates.some(candidate => candidate.ticker === company.ticker)))
    // A conflicting ticker/name or several companies requires a human decision.
    const record = matches.length === 1 && (!candidates.length || candidates.some(candidate => candidate.ticker === matches[0].ticker)) ? matches[0] : null
    if (record) {
      fields.company = record.company; fields.ticker = record.ticker; fields.industry = record.industry
      for (const field of ["company", "ticker", "industry"] as const) evidence.push({ field, source: "기존 기업표 대조 · 최신 시세 조회 아님", excerpt: `${record.company} (${record.ticker}) · ${record.industry}` })
    } else {
      fields.company = filenameCompany
      warnings.push("분석 대상 기업·종목코드를 확정하지 못했어요. 원문과 직접 대조해 주세요.")
    }
  }
  if (fields.company && fields.ticker) {
    const lines = (pages[0] ?? "").split("\n").map(line => line.replace(/[ \t]+/g, " ").trim())
    const headingIndex = lines.findIndex(line => line.includes(fields.company) && line.includes(fields.ticker))
    const next = headingIndex >= 0 ? lines[headingIndex + 1] : ""
    if (next && next.length >= 10 && next.length <= 140 && !/^(?:목표|현재|상승|시가|자본|발행|매출|영업|BUY|Stock|Date|Report|Company|[\d(])/i.test(next)) {
      fields.title = `[${fields.company}] ${next}`
      evidence.push({ field: "title", source: "기업명 바로 아래 소개 문구 · 확인 필요", excerpt: next, page: 1 })
    }
  }
  const date = add("date", /(?:발표일|작성일|발간일|보고서\s*기준일|Report\s*date|Date|Company\s*Analysis)\s*[:：]?\s*(20\d{2}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,2})/i)
  if (date) {
    const parts = date.split(/[.\/-]/).map(value => value.trim().padStart(2, "0"))
    const normalized = parts.join("-")
    if (validDate(normalized)) fields.date = normalized
  }
  fields.semester = title.match(/\b(20\d{2}-[12])\b/)?.[1] ?? ""
  fields.author = add("author", /(?:^|\n)\s*(?:작성자|작성팀|리서치팀|Author|Team(?!['’]s\b))[ \t]*[:：]?[ \t]*([^\n]{1,70})/i)
    || add("author", /(?:^|\n)[ \t]*([A-Za-z][A-Za-z\d .]{0,35}\bResearch[ \t]+Team[ \t]+\d+)[ \t]*(?:\n|$)/i)
  if (fields.author) fields.author = publicReportAuthor(fields.author)
  fields.targetYear = add("targetYear", /(?:타겟\s*(?:년도|연도)|목표\s*연도|Target\s*year)\s*[:：]?\s*(20\d{2}(?:\s*[-~·]\s*20\d{2})?)/i)
  // PDF.js may separate "4 , 555 , 000" into several text runs. Match the
  // whole number, including spaced comma groups; never accept a numeric prefix.
  fields.targetPrice = add("targetPrice", /(?:목표\s*주가|Target\s*price)\s*[:：]?\s*((?:₩[ \t]*)?\d+(?:[ \t]*,[ \t]*\d{3})*(?:[ \t]*\.[ \t]*\d+)?[ \t]*(?:원|KRW)?)(?![ \t]*[,\d])/i).replace(/\s*,\s*/g, ",").replace(/\s*\.\s*/g, ".").trim()
  fields.upside = add("upside", /(?:상승\s*여력|Upside)\s*[:：]?\s*([+-]?\d+(?:\s*\.\s*\d+)?\s*%)/i).replace(/\s*\.\s*/g, ".").replace(/\s*%/, "%")
  if (/\bnot\s+rated\b/i.test(text)) {
    if (fields.targetPrice) warnings.push("목표주가와 Not Rated가 함께 발견됐어요. 어느 의견이 해당 보고서의 것인지 확인해 주세요.")
    else { fields.notRated = true; fields.upside = "" }
  }
  if (!fields.date) warnings.push("발표일을 확정하지 못했어요. 업로드한 오늘 날짜를 대신 넣지 않았어요.")
  if (!fields.targetPrice && !fields.notRated) warnings.push("목표주가를 찾지 못했어요. 원문 확인 후 직접 입력하거나 Not Rated를 선택해 주세요.")
  if (text.replace(/\s/g, "").length < 40) warnings.push("추출된 텍스트가 적어요. 스캔 PDF는 표지를 보고 직접 입력해 주세요.")
  return { fields, evidence, warnings }
}
