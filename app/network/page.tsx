import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { AlumniOverview } from "@/components/alumni-overview"
import { redirect } from "next/navigation"
export const metadata = { title: "NETWORK | SMP" }
export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ group?: string; generation?: string }> }) {
  const params = await searchParams
  if (params.group === "members") redirect(`/members${params.generation ? `?generation=${encodeURIComponent(params.generation)}` : ""}`)
  const requested = Number(params.generation)
  const generation = Number.isInteger(requested) && requested >= 1 && requested <= 35 ? requested : 35
  return <><SiteHeader /><AlumniOverview generation={generation} /><SiteFooter /></>
}
