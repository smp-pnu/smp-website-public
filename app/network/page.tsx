import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { AlumniOverview } from "@/components/alumni-overview"
import { redirect } from "next/navigation"
import { getMembers } from "@/lib/member-catalog"
export const metadata = { title: "NETWORK | SMP" }
export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ group?: string; generation?: string }> }) {
  const params = await searchParams
  if (params.group === "members") redirect(`/members${params.generation ? `?generation=${encodeURIComponent(params.generation)}` : ""}`)
  const result = await getMembers()
  const alumni = { ...result, items: result.items.filter(member => member.group === "alumni") }
  return <><SiteHeader /><AlumniOverview generation={Number(params.generation)} members={alumni} /><SiteFooter /></>
}
