import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { NetworkTabs } from "@/components/network-tabs"
import { MembersDirectory } from "@/components/members-directory"
import { getMembers } from "@/lib/member-catalog"
export const metadata = { title: "MEMBERS | SMP" }
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ generation?: string }> }) {
  const [params, result] = await Promise.all([searchParams, getMembers()])
  const generation = Number(params.generation)
  const members = { ...result, items: result.items.filter(member => member.group === "members") }
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-6xl px-6 py-14"><NetworkTabs active="members" /><p className="text-xs tracking-[.3em] text-sky-300">NETWORK · OUR MEMBERS</p><h1 className="mt-5 text-4xl font-light text-white sm:text-5xl">MEMBERS</h1><MembersDirectory key={generation} result={members} initialGeneration={generation} /></main><SiteFooter /></>
}
