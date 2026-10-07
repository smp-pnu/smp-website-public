import type { ContentItem } from "./content-model"

type ResearchFields = Pick<ContentItem, "title" | "category" | "company" | "reportType" | "activity">

export function reportType(item: Pick<ResearchFields, "category" | "reportType">) {
  return item.reportType || (item.category === "산업분석" ? "산업분석" : "기업분석")
}

export function reportActivity(item: Pick<ResearchFields, "category" | "activity">) {
  return item.activity || (["기업분석", "산업분석"].includes(item.category) ? "정규 세션" : item.category)
}

// Older reports already identify the company in square brackets. Keep the full
// editorial title intact, and never treat a semester or an industry as a company.
export function reportCompany(item: ResearchFields) {
  if (item.company) return item.company
  if (reportType(item) === "산업분석") return ""
  const match = item.title.match(/^\[([^\]]+)\]/)?.[1].trim() ?? ""
  return /^\d{4}[-–.]\s?[12]$/.test(match) ? "" : match
}

export function researchFacts(summary: string) {
  const find = (pattern: RegExp) => summary.match(pattern)?.[1].trim()
  // A middle dot can be part of a value (e.g. 2015·2016년). Only a
  // space-delimited dot separates the legacy summary's fields.
  const targetYear = find(/타겟년도\s*[:：]\s*([^\n]+?)(?=\s+·\s+|$|\n)/i)
  const targetPrice = find(/(?:target\s*price|목표주가)\s*[:：]\s*([^\n]+?)(?=\s+·\s+|$|\n)/i)
  const upside = find(/상승여력\s*[:：]\s*([^\n]+?)(?=\s+·\s+|$|\n)/i)
  const notRated = /\bnot\s+rated\b/i.test(summary)
  return { targetYear, targetPrice: notRated ? undefined : targetPrice, upside: notRated ? undefined : upside, notRated }
}

export function relatedResearch(item: ContentItem, items: ContentItem[], limit = 3) {
  const candidates = items.filter(other => other.kind === "research" && other.id !== item.id)
  const company = reportCompany(item).toLocaleLowerCase()
  const groups = [
    { label: "같은 기업의 리포트", items: company ? candidates.filter(other => reportCompany(other).toLocaleLowerCase() === company) : [] },
    { label: "같은 업종의 리포트", items: item.industry ? candidates.filter(other => other.industry === item.industry) : [] },
    { label: "같은 학기의 리포트", items: item.semester ? candidates.filter(other => other.semester === item.semester) : [] },
  ]
  const group = groups.find(group => group.items.length)
  return group ? { label: group.label, items: group.items.slice(0, limit) } : null
}
