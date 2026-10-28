import type { MemberGroup, MemberRole } from "../lib/member-model"

export const rosterFields = ["name", "department", "year", "roles", "generation", "status"] as const
export type RosterField = typeof rosterFields[number]
export type RosterMapping = Record<RosterField, number | null>
export const rosterLabels: Record<RosterField, string> = { name: "이름", department: "학과", year: "학번 연도", roles: "직책", generation: "기수", status: "활동 상태·비고" }
export const emptyMapping = (): RosterMapping => ({ name: null, department: null, year: null, roles: null, generation: null, status: null })
export const rosterLimits = { file: 2 * 1024 * 1024, rows: 1000, columns: 40, selected: 100, sheets: 20 }
export type RosterSheet = { name: string; rows: string[][]; hiddenRows: number[]; merges?: {row:number;column:number;endRow:number;endColumn:number}[] }
export type RosterPerson = { row: number; name: string; department: string; year: string; roles: MemberRole[] }
export type RosterCandidate = RosterPerson & { selected: boolean; error: string; note: string }
export type ExistingMember = { id: string; name: string; department: string; year: string; trashed: boolean }
export const memberNameKey = (name: string) => name.normalize("NFKC").replace(/\s+/g, "").toLowerCase()
export const cleanRosterText = (value: string) => value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()

// Only this closed vocabulary crosses the AI boundary. No cell values, sheet
// names, filenames, names, full student IDs or free-form headers are transmitted.
const headerWords: Record<RosterField, RegExp> = {
  name: /^(?:이름|성명|회원명|한글성명|name|full\s*name)$/i,
  department: /(?:학과|전공|학부|소속학|major|department)/i,
  year: /(?:학번|입학년|입학연|student.?id|entry.?year)/i,
  roles: /(?:직책|직위|역할|보직|임원|role|position)/i,
  generation: /(?:기수|입회기|generation|cohort)/i,
  status: /(?:비고|수료|활동상태|활동여부|status|note)/i,
}
export type ColumnProfile = { index: number; hints: RosterField[]; shapes: string[] }
export const rosterShapes = ["text", "short-number", "year-number", "long-number", "cohort", "department", "role", "empty"] as const
export function rosterProfile(sheet: RosterSheet, header: number): ColumnProfile[] {
  const rows = sheet.rows.slice(header + 1, header + 21)
  const width = Math.min(rosterLimits.columns, Math.max(sheet.rows[header]?.length ?? 0, ...rows.map(r => r.length)))
  return Array.from({ length: width }, (_, index) => {
    const title = cleanRosterText(sheet.rows[header]?.[index] ?? "")
    const counts = new Map<string, number>()
    for (const row of rows) {
      const v = cleanRosterText(row[index] ?? "")
      const shape = !v ? "empty" : /^\d{1,3}\s*기$/.test(v) ? "cohort" : /^(?:19|20)\d{2}$/.test(v) ? "year-number" : /^\d{1,3}$/.test(v) ? "short-number" : /^\d{5,}$/.test(v) ? "long-number" : /(?:학과|학부|전공)$/.test(v) ? "department" : /^(?:회장|부회장|기장)$/.test(v) ? "role" : "text"
      counts.set(shape, (counts.get(shape) ?? 0) + 1)
    }
    return { index, hints: rosterFields.filter(f => headerWords[f].test(title)), shapes: [...counts].sort((a,b) => b[1]-a[1]).slice(0,3).map(([s])=>s) }
  })
}
export function suggestMapping(profile: ColumnProfile[]): RosterMapping {
  const mapping = emptyMapping(), used = new Set<number>()
  for (const field of rosterFields) {
    const matches = profile.filter(p => p.hints.includes(field) && !used.has(p.index))
    if (matches.length === 1) { mapping[field] = matches[0].index; used.add(matches[0].index) }
  }
  return mapping
}
export function headerRow(sheet: RosterSheet) {
  let best = 0, score = -1
  for (let r = 0; r < Math.min(50, sheet.rows.length); r++) {
    const hints = rosterProfile(sheet,r).flatMap(p=>p.hints)
    const n = new Set(hints).size + (hints.includes("name") ? 5 : 0)
    if (n > score) { best = r; score = n }
  }
  return best
}
export function validateRosterMapping(input: unknown, width: number): RosterMapping {
  const out = emptyMapping(), used = new Set<number>()
  if (!input || typeof input !== "object" || Array.isArray(input)) return out
  for (const field of rosterFields) {
    const n = (input as Record<string, unknown>)[field]
    if (Number.isInteger(n) && Number(n) >= 0 && Number(n) < width && !used.has(Number(n))) {
      out[field] = Number(n); used.add(Number(n))
    }
  }
  return out
}
export function studentYear(value: string) {
  const v = cleanRosterText(value).replace(/\s*(?:학번|년(?:도)?)$/, "")
  if (/^\d{2}$/.test(v)) return v
  if (/^(?:19|20)\d{2}(?:\d{3,6})?$/.test(v)) return v.slice(2,4)
  return ""
}
export function rosterRoles(value: string): MemberRole[] {
  const words = cleanRosterText(value).split(/[\s,·/;|()]+/)
  return (["회장", "부회장", "기장"] as const).filter(r => words.includes(r))
}
export function validMemberName(value: string) {
  return /^[가-힣A-Za-z][가-힣A-Za-z .·'’-]{1,49}$/.test(value) && !/^(?:이름|성명|회원명|합계|총계|회장단|리서치팀|신입팀|name|total)$/i.test(value)
}
export function rosterCandidates(sheet: RosterSheet, header: number, mapping: RosterMapping, generation: number): RosterCandidate[] {
  if (mapping.name === null) return []
  const result: RosterCandidate[] = [], hidden = new Set(sheet.hiddenRows)
  for (let r = header + 1; r < sheet.rows.length; r++) {
    if (hidden.has(r)) continue
    const get = (f: RosterField) => {
      const column=mapping[f];if(column===null)return ""
      let value=sheet.rows[r]?.[column]??""
      if(!value&&f==="generation") {
        const merge=sheet.merges?.find(m=>m.row<=r&&m.endRow>=r&&m.column===column&&m.endColumn===column)
        if(merge)value=sheet.rows[merge.row]?.[column]??""
      }
      return cleanRosterText(value)
    }
    const name = get("name")
    if (!name || headerWords.name.test(name)) continue
    const cohort = get("generation"), parsed = cohort.match(/^(\d{1,3})\s*기?$/), status = get("status")
    const error = !validMemberName(name) ? "이름 확인 필요" : cohort && (!parsed || Number(parsed[1]) !== generation) ? "선택 기수와 다름" : ""
    const excluded = /미수료|중도\s*(?:탈퇴|이탈)|탈퇴|제외|1년\s*미만/.test(status)
    const year = studentYear(get("year"))
    const note = [excluded ? "비고에 제외·미수료 표시" : "", get("year") && !year ? "학번 연도 확인 필요" : "", get("roles") && !rosterRoles(get("roles")).length ? "직책 확인 필요" : ""].filter(Boolean).join(" · ")
    result.push({ row: r + 1, name, department: get("department").slice(0,100), year, roles: rosterRoles(get("roles")), error, note, selected: !error && !excluded })
  }
  return result
}
export function duplicateRosterRows(candidates: RosterCandidate[], existing: ExistingMember[]) {
  const known = new Map(existing.map(m=>[memberNameKey(m.name),m])), seen = new Set<string>(), reasons = new Map<number,string>()
  for (const row of candidates) {
    const key = memberNameKey(row.name), previous = known.get(key)
    if (previous) reasons.set(row.row, previous.trashed ? "휴지통에 있는 이름 · 복원 여부 확인" : "이미 등록된 이름")
    else if (seen.has(key)) reasons.set(row.row,"엑셀 안에서 이름 중복 · 개별 확인")
    else seen.add(key)
  }
  return reasons
}
export type RosterImportInput = { batchId: string; generation: number; group: MemberGroup; reviewed: true; members: RosterPerson[] }
