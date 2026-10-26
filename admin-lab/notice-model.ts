export type BlockType = "paragraph" | "heading" | "bullet" | "numbered" | "quote" | "divider" | "image"
export type NoticeBlock = { id: string; type: BlockType; text: string; assetId?: string; href?: string }
export type Notice = {
  id: string
  title: string
  category: string
  date: string
  pinned: boolean
  blocks: NoticeBlock[]
  revision: number
  approvedRevision: number | null
  createdAt: string
  updatedAt: string
  trashedAt: string | null
}
export type NoticeSummary = Omit<Notice, "blocks"> & { excerpt: string }
export const noticeLimits = {
  count: 100,
  blocks: 80,
  images: 12,
  characters: 12000,
  imageBytes: 1024 * 1024,
} as const
export const blockLabels: Record<BlockType, string> = {
  paragraph: "본문",
  heading: "소제목",
  bullet: "글머리 항목",
  numbered: "번호 항목",
  quote: "인용·강조",
  divider: "구분선",
  image: "사진",
}
export function newBlock(type: BlockType = "paragraph"): NoticeBlock {
  return { id: crypto.randomUUID(), type, text: "" }
}
export function noticeState(n: Notice | NoticeSummary) {
  return n.trashedAt ? "휴지통" : n.approvedRevision === n.revision ? "시험 승인" : "초안"
}

export function safeNoticeLink(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ["https:", "mailto:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}
