import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { MembersOverview } from "@/components/members-overview"
import { getMembers } from "@/lib/member-catalog"
export const metadata = { title: "MEMBERS | SMP" }
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ generation?: string }> }) {
  const [params, result] = await Promise.all([searchParams, getMembers()])
  const generation = Number(params.generation)
  const members = { ...result, items: result.items.filter(member => member.group === "members") }
  // Keep the two missing cohorts selectable until a roster is registered.
  // Once a cohort moves to ALUMNI, it no longer needs a MEMBERS placeholder.
  const reservedGenerations = [38, 39].filter(generation => !result.items.some(member => member.generation === generation && member.group === "alumni"))
  return <><SiteHeader /><MembersOverview generation={generation} members={members} reservedGenerations={reservedGenerations} /><SiteFooter /></>
}
