import type { LoaderFunctionArgs } from "react-router"
import type { ContentBlock } from "@/lib/notion-model"
import type { RelatedReports } from "@/lib/related-reports"
import type { PreparedItem } from "./grid"
import { readApi } from "./api"

export type DetailData = { item: PreparedItem; blocks: ContentBlock[]; bodyPending?: boolean; related?: RelatedReports }
export type DetailResult = { value?: DetailData; error?: Error }

// Keep the current page usable until the ordinary publication check finishes.
// No hover prefetch, cached detail, PDF fetch or image generation is added here.
export async function loadResearchDetail({ params }: Pick<LoaderFunctionArgs, "params">): Promise<DetailResult> {
  try { return { value: await readApi<DetailData>(`/api/detail/research/${encodeURIComponent(params.id ?? "")}`, 0) } }
  catch (error) { return { error: error instanceof Error ? error : new Error("리포트를 불러오지 못했습니다.") } }
}
