export type ContentKind = "notice" | "research"

export type RichText = {
  plain_text?: string
  text?: { content: string; link?: { url: string } | null }
  href?: string | null
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean }
}

export type NotionFile = {
  name?: string
  type?: string
  file?: { url: string }
  external?: { url: string }
}

type Property = {
  type: string
  title?: RichText[]
  rich_text?: RichText[]
  checkbox?: boolean
  date?: { start: string } | null
  select?: { name: string; color?: string } | null
  multi_select?: { name: string; color?: string }[]
  number?: number | null
  url?: string | null
  files?: NotionFile[]
}

export type NotionPage = {
  id: string
  object: string
  archived?: boolean
  in_trash?: boolean
  parent?: { type: string; data_source_id?: string }
  created_time: string
  last_edited_time?: string
  properties: Record<string, Property>
}

export type ContentItem = {
  id: string
  kind: ContentKind
  title: string
  summary: string
  date: string
  category: string
  categoryColor?: string
  author: string
  pinned: boolean
  semester?: string
  semesterOrder?: number
  industry?: string
  company?: string
  ticker?: string
  reportType?: string
  activity?: string
  investmentPoints?: string[]
  attachments: { name: string; url: string }[]
  externalUrl: string | null
  editedAt?: string
}

export function plainText(value: RichText[] = []) {
  return value.map(part => part.plain_text ?? part.text?.content ?? "").join("")
}

export function safeUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function normalizeId(value: string) {
  const compact = value.replaceAll("-", "")
  return /^[a-f\d]{32}$/i.test(compact) ? compact.toLowerCase() : null
}

export function fileUrl(file: NotionFile) {
  return safeUrl(file.file?.url ?? file.external?.url)
}

export function toContentItem(page: NotionPage, kind: ContentKind, now = Date.now()): ContentItem | null {
  const props = page.properties
  if (page.object !== "page" || page.archived || page.in_trash || props["공개"]?.checkbox !== true) return null
  const date = props["게시일"]?.date?.start
  // A date without a time is interpreted as midnight in Korea, not UTC.
  const timestamp = date ? Date.parse(date.length === 10 ? `${date}T00:00:00+09:00` : date) : NaN
  if (!Number.isFinite(timestamp) || timestamp > now) return null
  const id = normalizeId(page.id)
  const title = plainText(props["제목"]?.title).trim()
  if (!id || !title) return null
  const semester = plainText(props["학기"]?.rich_text).trim()
  const semesterOrder = props["학기 내 순서"]?.number
  return {
    id, kind, title, date: date!, editedAt: page.last_edited_time ?? page.created_time,
    summary: plainText(props["요약"]?.rich_text),
    category: props["분류"]?.select?.name ?? (kind === "notice" ? "공지" : "리서치"),
    categoryColor: props["분류"]?.select?.color ?? "default",
    author: plainText(props["작성자"]?.rich_text),
    pinned: kind === "notice" && props["상단 고정"]?.checkbox === true,
    semester: kind === "research" && /^\d{4}-[12]$/.test(semester) ? semester : undefined,
    semesterOrder: kind === "research" && typeof semesterOrder === "number" && Number.isFinite(semesterOrder) && semesterOrder > 0
      ? semesterOrder : undefined,
    ...(kind === "research" ? {
      industry: props["업종"]?.select?.name?.trim() || undefined,
      company: plainText(props["기업명"]?.rich_text).trim() || undefined,
      ticker: plainText(props["종목코드"]?.rich_text).trim() || undefined,
      reportType: props["보고서 종류"]?.select?.name || undefined,
      activity: props["활동"]?.select?.name || undefined,
      investmentPoints: plainText(props["투자 포인트"]?.rich_text).split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 3),
    } : {}),
    externalUrl: safeUrl(props["외부 링크"]?.url),
    attachments: (props["첨부파일"]?.files ?? []).flatMap(file => {
      const url = fileUrl(file)
      return url ? [{ name: file.name || "첨부파일", url }] : []
    }),
  }
}

export function sortContent(items: ContentItem[]) {
  // Scope manual order to a semester. Missing semesters come last; missing
  // numbers come last within that semester. No per-card Notion reads are needed.
  const reportOrder = (a: ContentItem, b: ContentItem) => a.kind === "research" && b.kind === "research"
    ? (b.semester ?? "").localeCompare(a.semester ?? "")
      || (a.semester ? (a.semesterOrder ?? Infinity) - (b.semesterOrder ?? Infinity) : 0)
    : 0
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned)
    || reportOrder(a, b)
    || b.date.localeCompare(a.date)
    || (a.kind === "research" && b.kind === "research" ? a.title.localeCompare(b.title, "ko", { numeric: true }) : 0)
    || a.id.localeCompare(b.id))
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date))
}

export function contentHref(item: Pick<ContentItem, "kind" | "id">) {
  return `/${item.kind}/${item.id}`
}
