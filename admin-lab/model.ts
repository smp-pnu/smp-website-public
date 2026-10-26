export const limits = { fileBytes: 32 * 1024 * 1024, totalBytes: 200 * 1024 * 1024, batch: 5, drafts: 50, pages: 120, extractPages: 3, timeoutMs: 30_000 } as const
export type Fields = {
  title: string; company: string; ticker: string; date: string; semester: string; author: string;
  industry: string; reportType: "기업분석" | "산업분석"; targetYear: string; targetPrice: string; upside: string; notRated: boolean;
}
export type Evidence = { field: keyof Fields; source: string; excerpt: string; page?: number }
export type Draft = {
  id: string; hash: string; filename: string; fileBytes: number; storedBytes: number; pages: number;
  fields: Fields; evidence: Evidence[]; warnings: string[];
  revision: number; approvedRevision: number | null; approvedAt: string | null; updatedAt: string;
  createdAt: string; trashedAt: string | null;
  release?: { revision: number; at: string; title: string };
}
export type Assets = { id: string; pdf: Blob; cover: Blob }
export const emptyFields = (): Fields => ({ title: "", company: "", ticker: "", date: "", semester: "", author: "", industry: "", reportType: "기업분석", targetYear: "", targetPrice: "", upside: "", notRated: false })
export const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
export const statusOf = (draft: Draft) => draft.trashedAt ? "휴지통" : draft.approvedRevision === draft.revision ? "시험 승인" : "검토 대기"

export function validateFile(file: Pick<File, "name" | "size" | "type">) {
  if (!/\.pdf$/i.test(file.name)) throw Error("PDF 파일만 추가할 수 있어요.")
  if (file.type && !["application/pdf", "application/octet-stream"].includes(file.type)) throw Error("PDF 형식을 확인해 주세요.")
  if (file.size < 8) throw Error("파일이 비어 있거나 손상됐어요.")
  if (file.size > limits.fileBytes) throw Error("시험판에서는 PDF 한 개당 32 MB까지 처리해요.")
}
export function checkCapacity(drafts: Draft[], bytes: number) {
  if (drafts.length >= limits.drafts) throw Error("시험 저장 한도 50개에 도달했어요. 휴지통의 불필요한 자료를 정리해 주세요.")
  if (drafts.reduce((sum, item) => sum + item.storedBytes, 0) + bytes > limits.totalBytes) throw Error("브라우저 시험 저장 한도 200 MB에 도달했어요.")
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function reviewErrors(fields: Fields) {
  const errors: string[] = []
  if (!fields.title.trim()) errors.push("제목을 입력해 주세요.")
  if (!validDate(fields.date)) errors.push("보고서 발표일을 확인해 주세요.")
  if (!/^\d{4}-[12]$/.test(fields.semester)) errors.push("학기를 2026-2 형식으로 입력해 주세요.")
  if (!fields.author.trim()) errors.push("작성자 또는 팀을 입력해 주세요.")
  if (fields.reportType === "기업분석" && !fields.company.trim()) errors.push("기업명을 확인해 주세요.")
  if (fields.ticker && !/^\d{6}$/.test(fields.ticker)) errors.push("종목코드는 앞자리 0을 포함한 6자리예요.")
  if (!fields.notRated && !fields.targetPrice.trim()) errors.push("목표주가를 입력하거나 Not Rated를 선택해 주세요.")
  return errors
}
export function editDraft(draft: Draft, fields: Fields, now: string): Draft {
  const clean = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === "string" ? value.trim().slice(0, 500) : value])) as Fields
  if (clean.notRated) { clean.targetPrice = ""; clean.upside = "" }
  if (JSON.stringify(clean) === JSON.stringify(draft.fields)) return draft
  return { ...draft, fields: clean, revision: draft.revision + 1, approvedRevision: null, approvedAt: null, updatedAt: now }
}
export function approveDraft(draft: Draft, reviewed: boolean, now: string): Draft {
  if (draft.trashedAt) throw Error("휴지통에서 먼저 복원해 주세요.")
  if (!reviewed) throw Error("PDF 원문과 입력 내용을 확인해 주세요.")
  const errors = reviewErrors(draft.fields)
  if (errors.length) throw Error(errors.join(" "))
  return { ...draft, approvedRevision: draft.revision, approvedAt: now, updatedAt: now }
}
export function trashDraft(draft: Draft, trashed: boolean, now: string): Draft {
  return { ...draft, trashedAt: trashed ? now : null, approvedRevision: null, approvedAt: null, updatedAt: now, revision: draft.revision + 1 }
}
export function reportSummary(fields: Fields) {
  return [fields.targetYear && `타겟년도: ${fields.targetYear}`, fields.notRated ? "Not Rated" : fields.targetPrice && `Target price: ${fields.targetPrice}`, !fields.notRated && fields.upside && `상승여력: ${fields.upside}`].filter(Boolean).join(" · ")
}

export type DraftCommand =
  | { type: "edit"; fields: Fields }
  | { type: "approve"; reviewed: boolean }
  | { type: "trash"; trashed: boolean }
  | { type: "remove" }
  | { type: "reanalyze"; fields: Fields; evidence: Evidence[]; warnings: string[] }
export function applyCommand(draft: Draft, command: DraftCommand, now: string): Draft | null {
  if (draft.trashedAt && ["edit", "reanalyze"].includes(command.type)) throw Error("휴지통에서 먼저 복원해 주세요.")
  switch (command.type) {
    case "edit": return editDraft(draft, command.fields, now)
    case "approve": return approveDraft(draft, command.reviewed, now)
    case "trash": return trashDraft(draft, command.trashed, now)
    case "remove": if (!draft.trashedAt) throw Error("휴지통에서만 영구 삭제할 수 있어요."); return null
    case "reanalyze": return { ...draft, fields: command.fields, evidence: command.evidence, warnings: command.warnings,
      revision: draft.revision + 1, approvedRevision: null, approvedAt: null, updatedAt: now }
  }
}
