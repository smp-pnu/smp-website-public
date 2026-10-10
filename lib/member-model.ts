import { fileUrl, normalizeId, plainText, safeUrl, type NotionPage } from "./content-model"
import { cmsImageUrl } from "./cms-image-url"

export type MemberGroup = "alumni" | "members"
const memberRoles = ["회장", "부회장", "기장"] as const
export type MemberRole = typeof memberRoles[number]
export type Member = {
  id: string
  generation: number
  group: MemberGroup
  name: string
  department: string
  year: string
  image?: string
  order?: number
  roles?: MemberRole[]
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
  // Accept the original single select while the live schema is being migrated.
  const category = props["구분"]
  const categories = new Set(category?.multi_select?.map(option => option.name)
    ?? (category?.select ? [category.select.name] : []))
  const sections = ["ALUMNI", "MEMBERS"].filter(section => categories.has(section))
  if (!id || !name || !Number.isSafeInteger(generation) || generation! < 1 || generation! > 999
    || sections.length !== 1) return null
  const roles = memberRoles.filter(role => categories.has(role))
  const photo = props["사진"]?.files?.[0]
  const image = (photo ? fileUrl(photo) : null) ?? safeUrl(props["사진 링크"]?.url)
  const order = props["표시 순서"]?.number
  return {
    id, name, generation: generation!, group: sections[0] === "ALUMNI" ? "alumni" : "members",
    department: plainText(props["학과"]?.rich_text).trim(), year: plainText(props["학번"]?.rich_text).trim(),
    ...(image ? { image: cmsImageUrl(image) } : {}),
    ...(typeof order === "number" && Number.isFinite(order) && order > 0 ? { order } : {}),
    ...(roles.length ? { roles } : {}),
  }
}

export function sortMembers(items: Member[]) {
  return [...items].sort((a, b) => b.generation - a.generation
    || (a.order ?? Infinity) - (b.order ?? Infinity)
    || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id))
}

export function memberGenerations(items: Member[], reserved: number[] = []) {
  return [...new Set([...reserved, ...items.map(member => member.generation)])].sort((a, b) => b - a)
}

export function memberSearchEntries(items: Member[]) {
  return items.map(member => ({ title: member.name,
    text: [member.generation + "기", ...(member.roles ?? []), member.department, member.year].filter(Boolean).join(" · "),
    href: `/${member.group}?generation=${member.generation}#generation-panel`, label: "회원" }))
}
