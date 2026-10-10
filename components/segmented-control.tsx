import Link from "next/link"
import type { ComponentProps } from "react"

export function SegmentedControl({ className = "", ...props }: ComponentProps<"nav">) {
  return <nav {...props} className={`flex min-h-11 items-center gap-0.5 rounded-[4px] border border-white/10 bg-white/[0.025] p-1 ${className}`} />
}

export function SegmentedControlLink({ active, className = "", ...props }: ComponentProps<typeof Link> & { active: boolean }) {
  return <Link {...props} className={`inline-flex min-h-9 items-center justify-center rounded-[2px] text-xs transition-colors focus-visible:outline-2 focus-visible:outline-sky-200 ${active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"} ${className}`} />
}
