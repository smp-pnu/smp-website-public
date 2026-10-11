import type { MemberResult } from "@/lib/member-model"
import { MembersDirectory } from "./members-directory"
import { NetworkLayout } from "./network-layout"

export function MembersOverview({ generation, members, reservedGenerations }: {
  generation?: number
  members: MemberResult
  reservedGenerations: number[]
}) {
  return <NetworkLayout active="members">
    <section className="border-t border-site-line py-12 sm:py-20">
      <p className="text-xs tracking-[.3em] text-site-accent">OUR MEMBERS</p>
      <h2 className="mt-5 text-4xl font-light">MEMBERS</h2>
      <MembersDirectory key={generation} result={members} initialGeneration={generation} reservedGenerations={reservedGenerations} />
    </section>
  </NetworkLayout>
}
