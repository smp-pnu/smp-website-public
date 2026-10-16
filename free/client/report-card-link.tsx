import { useSyncExternalStore, type ReactNode } from "react"
import { NavLink } from "react-router"

const motionQuery = "(min-width: 768px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
function subscribe(listener: () => void) {
  const media = window.matchMedia(motionQuery)
  media.addEventListener("change", listener)
  return () => media.removeEventListener("change", listener)
}
const canAnimate = () => typeof document.startViewTransition === "function" && window.matchMedia(motionQuery).matches

export function ReportCardLink({ href, children }: { href: string; children: ReactNode }) {
  const animate = useSyncExternalStore(subscribe, canAnimate, () => false)
  return <NavLink to={href} viewTransition={animate}
    className={({ isPending, isTransitioning }) => `research-card${isPending ? " report-opening" : ""}${isTransitioning ? " report-cover-transitioning" : ""}`}>
    {({ isPending }) => <>{children}{isPending && <span role="status" className="report-opening-status">리포트를 여는 중입니다…</span>}</>}
  </NavLink>
}
