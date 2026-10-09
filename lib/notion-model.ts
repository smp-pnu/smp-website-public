import type { ContentItem, NotionFile, RichText } from "./content-model"
type BlockValue = NotionFile & {
  rich_text?: RichText[]; caption?: RichText[]; url?: string; language?: string
  checked?: boolean; cells?: RichText[][]; has_column_header?: boolean; has_row_header?: boolean
}
export type ContentBlock = {
  id: string; type: string; has_children?: boolean; archived?: boolean; in_trash?: boolean
  children?: ContentBlock[]
  [key: string]: unknown
}
export function blockValue(block: ContentBlock) { return (block[block.type] ?? {}) as BlockValue }

export type ContentResult = { items: ContentItem[]; state: "ready" | "unconfigured" | "error" }
