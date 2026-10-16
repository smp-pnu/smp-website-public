import { ResearchGridView } from "@/components/research-grid-view"
import { ReportCover } from "@/components/report-cover"
import type { ContentItem } from "@/lib/content-model"
import type { ContentSearch } from "@/lib/content-navigation"
import type { ReaderPreview } from "@/lib/report-reader"

export type PreparedItem = ContentItem & { cover?: { url: string; previewUrl: string; width: number; height: number; reader?:ReaderPreview } }
export function ResearchGrid(props: { items: ContentItem[]; listSearch?: ContentSearch }) {
  return <ResearchGridView {...props} renderCover={(item, eager) => <ReportCover title={item.title} eager={eager}
    imageUrl={(item as PreparedItem).cover?.url} /> } />
}
