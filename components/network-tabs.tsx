"use client"
import Link from "next/link"
import { useNetworkTransition } from "./network-transition"
export function NetworkTabs({ active }: { active: "alumni" | "members" }) {
  const navigate = useNetworkTransition()
  return <nav aria-label="네트워크 분류" className="mx-auto mb-16 flex max-w-xs rounded-full border border-white/25 bg-black/35 p-1.5 backdrop-blur-md">
    {(["alumni", "members"] as const).map(group => <Link key={group} href={`/${group}`} onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault()
      if (active !== group) navigate(`/${group}`)
    }} aria-current={active === group ? "page" : undefined} className={`flex-1 rounded-full px-4 py-2 text-center text-xs tracking-[.18em] transition-colors ${active === group ? "bg-white/15 text-white shadow-inner ring-1 ring-white/15" : "text-white/70 hover:text-white"}`}>{group.toUpperCase()}</Link>)}
  </nav>
}
