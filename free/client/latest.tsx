import { useApi } from "./api"
import type { ContentResult } from "@/lib/notion-model"
import { sortContent } from "@/lib/content-model"
import { ResearchShowcase } from "@/components/research-showcase"
export function LatestResearchSection() {
  const { value, error } = useApi<ContentResult>("/api/catalog/research")
  return <ResearchShowcase items={value ? sortContent(value.items).slice(0, 3) : []} pending={!value && !error} error={error?.message} />
}
