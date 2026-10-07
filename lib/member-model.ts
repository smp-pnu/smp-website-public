import { fileUrl, normalizeId, plainText, safeUrl, type NotionPage } from "./content-model"

export type MemberGroup = "alumni" | "members"
export type Member = {
  id: string
  generation: number
  group: MemberGroup
  name: string
  department: string
  year: string
  image?: string
  order?: number
}
export type MemberResult = { items: Member[]; state: "ready" | "unconfigured" | "error" }

export function toMember(page: NotionPage, source: string): Member | null {
  const props = page.properties
  const sourceId = normalizeId(source)
  if (!sourceId || page.object !== "page" || page.archived || page.in_trash || props["공개"]?.checkbox !== true
    || page.parent?.type !== "data_source_id" || normalizeId(page.parent.data_source_id ?? "") !== sourceId) return null
  const id = normalizeId(page.id)
  const name = plainText(props["이름"]?.title).trim()
  const generation = props["기수"]?.number
  const section = props["구분"]?.select?.name
  if (!id || !name || !Number.isSafeInteger(generation) || generation! < 1 || generation! > 999
    || (section !== "ALUMNI" && section !== "MEMBERS")) return null
  const photo = props["사진"]?.files?.[0]
  const image = (photo ? fileUrl(photo) : null) ?? safeUrl(props["사진 링크"]?.url)
  const order = props["표시 순서"]?.number
  return {
    id, name, generation: generation!, group: section === "ALUMNI" ? "alumni" : "members",
    department: plainText(props["학과"]?.rich_text).trim(), year: plainText(props["학번"]?.rich_text).trim(),
    ...(image ? { image } : {}),
    ...(typeof order === "number" && Number.isFinite(order) && order > 0 ? { order } : {}),
  }
}

export function sortMembers(items: Member[]) {
  return [...items].sort((a, b) => b.generation - a.generation
    || (a.order ?? Infinity) - (b.order ?? Infinity)
    || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id))
}

export function memberGenerations(items: Member[]) {
  return [...new Set(items.map(member => member.generation))].sort((a, b) => b - a)
}

export function memberSearchEntries(items: Member[]) {
  return items.map(member => ({ title: member.name,
    text: [member.generation + "기", member.department, member.year].filter(Boolean).join(" · "),
    href: `/${member.group}?generation=${member.generation}#generation-panel`, label: "회원" }))
}
