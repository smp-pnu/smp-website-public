import { useApi } from "./api"
import type { ContentResult } from "@/lib/notion-model"
import { latestResearchEdition } from "@/lib/latest-research"
import { ResearchShowcase } from "@/components/research-showcase"
export function LatestResearchSection() {
  const { value, error } = useApi<ContentResult>("/api/catalog/research")
  return <ResearchShowcase items={value ? latestResearchEdition(value.items) : []} pending={!value && !error} error={error?.message} />
}
