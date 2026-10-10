"use client"
import { SegmentedControl, SegmentedControlLink } from "./segmented-control"
import { useNetworkTransition } from "./network-transition"
export function NetworkTabs({ active }: { active: "alumni" | "members" }) {
  const navigate = useNetworkTransition()
  return <SegmentedControl aria-label="네트워크 분류" className="mx-auto mb-16 max-w-xs">
    {(["alumni", "members"] as const).map(group => <SegmentedControlLink active={active === group} key={group} href={`/${group}`} onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault()
      if (active !== group) navigate(`/${group}`)
    }} aria-current={active === group ? "page" : undefined} className="flex-1 px-4 tracking-[.14em]">{group.toUpperCase()}</SegmentedControlLink>)}
  </SegmentedControl>
}
