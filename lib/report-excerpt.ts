import type { ContentBlock } from "./notion-model"

// Plain source text, never an AI-authored investment recommendation.
export type ReportExcerpt = { version: 1; pages: { number: number; text: string }[] }
export function reportExcerpt(pages: string[]): ReportExcerpt {
  return { version: 1, pages: pages.slice(0, 2).flatMap((raw, index) => {
    const text = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/g, "")
      .split(/\r?\n/).map(line => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n")
    // Image-only/garbled PDFs are left alone; there is no paid OCR fallback.
    if ((text.match(/[가-힣a-zA-Z]/g) ?? []).length < 100) return []
    const limit = text.slice(0, 1200)
    const end = text.length > 1200 ? Math.max(limit.lastIndexOf(". "), limit.lastIndexOf(".\n"), limit.lastIndexOf("\n")) : limit.length
    return [{ number: index + 1, text: limit.slice(0, end > 600 ? end : limit.length).trim() }]
  }) }
}
export function validReportExcerpt(value: unknown): value is ReportExcerpt {
  if (!value || typeof value !== "object") return false
  const v = value as ReportExcerpt
  return v.version === 1 && Array.isArray(v.pages) && v.pages.length <= 2 && v.pages.every((page, i) =>
    page && Number.isInteger(page.number) && page.number >= 1 && page.number <= 2 && (i === 0 || page.number > v.pages[i - 1].number)
    && typeof page.text === "string" && page.text.length > 0 && page.text.length <= 1200)
}
export function withReportExcerpt(id: string, blocks: ContentBlock[], excerpt: unknown): ContentBlock[] {
  // Notion remains the editor: any authored body takes precedence over extraction.
  if (blocks.some(block => block.type !== "paragraph" || block.children?.length ||
    ((block.paragraph as { rich_text?: { plain_text?: string; text?: { content?: string } }[] })?.rich_text ?? [])
      .some(part => (part.plain_text ?? part.text?.content ?? "").trim())) || !validReportExcerpt(excerpt) || !excerpt.pages.length) return blocks
  const text = (value: string) => [{ type: "text", text: { content: value }, plain_text: value }]
  return [{ id: `${id}-excerpt`, type: "toggle", toggle: { rich_text: text("PDF 원문 발췌") }, children: [
    { id: `${id}-excerpt-note`, type: "paragraph", paragraph: { rich_text: text("PDF 앞부분에서 자동 추출한 원문 일부입니다. 표·도표와 전체 문맥은 PDF에서 확인해주세요.") } },
    ...excerpt.pages.flatMap(page => [
      { id: `${id}-excerpt-${page.number}-heading`, type: "heading_3", heading_3: { rich_text: text(`원문 ${page.number}쪽`) } },
      { id: `${id}-excerpt-${page.number}`, type: "paragraph", paragraph: { rich_text: text(page.text) } },
    ]),
  ] }]
}
