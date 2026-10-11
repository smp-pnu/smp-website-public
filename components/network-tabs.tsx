"use client"
import Link from "next/link"
import { SegmentedControl } from "./segmented-control"
import { useNetworkTransition } from "./network-transition"
export function NetworkTabs({ active }: { active: "alumni" | "members" }) {
  const navigate = useNetworkTransition()
  return <SegmentedControl aria-label="네트워크 분류" className="network-tabs mx-auto mt-8 max-w-xs sm:mt-10" data-active={active}>
    <span className="network-tabs__selection" aria-hidden="true" />
    {(["alumni", "members"] as const).map(group => <Link data-network-tab key={group} href={`/${group}`} onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault()
      if (active !== group) navigate(`/${group}`)
    }} aria-current={active === group ? "page" : undefined} className="network-tabs__link relative flex min-h-9 flex-1 items-center justify-center rounded-[2px] px-4 text-xs tracking-[.14em] focus-visible:outline-2 focus-visible:outline-site-accent">{group.toUpperCase()}</Link>)}
  </SegmentedControl>
}
