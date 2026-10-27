import { emptyFields, limits, type Fields, type Evidence, type DraftCommand } from "../admin-lab/model"
export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
export const bad = (message = "요청 형식을 확인해 주세요."): never => { throw new HttpError(400, message) }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad()
  return value as Record<string, unknown>
}
export function text(value: unknown, max = 500) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return bad()
  return value.trim()
}
export function fields(value: unknown): Fields {
  const source = object(value); const result = emptyFields()
  for (const key of Object.keys(result) as (keyof Fields)[]) {
    if (key === "notRated") { if (typeof source[key] !== "boolean") bad(); result[key] = source[key] as boolean }
    else { (result as unknown as Record<string, unknown>)[key] = text(source[key], key === "title" ? 200 : 100) }
  }
  if (!["기업분석", "산업분석"].includes(result.reportType)) bad()
  if (result.notRated) { result.targetPrice = ""; result.upside = "" }
  return result
}
export function evidence(value: unknown, pages: number = limits.pages): Evidence[] {
  if (!Array.isArray(value) || value.length > 40) return bad()
  return value.map(item => {
    const source = object(item); const field = text(source.field, 30) as keyof Fields
    if (!(Object.hasOwn(emptyFields(), field))) bad()
    const page = source.page
    if (page !== undefined && (!Number.isSafeInteger(page) || Number(page) < 1 || Number(page) > pages)) bad()
    return { field, source: text(source.source, 150), excerpt: text(source.excerpt, 500), ...(page ? { page: page as number } : {}) }
  })
}
export function warnings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) return bad()
  return value.map(item => text(item, 500))
}
export function command(value: unknown, pages: number): DraftCommand {
  const source = object(value)
  switch (source.type) {
    case "edit": return { type: "edit", fields: fields(source.fields) }
    case "approve": if (typeof source.reviewed !== "boolean") return bad(); return { type: "approve", reviewed: source.reviewed }
    case "trash": if (typeof source.trashed !== "boolean") return bad(); return { type: "trash", trashed: source.trashed }
    case "remove": return { type: "remove" }
    case "reanalyze": return { type: "reanalyze", fields: fields(source.fields), evidence: evidence(source.evidence, pages), warnings: warnings(source.warnings) }
    default: return bad()
  }
}
export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
