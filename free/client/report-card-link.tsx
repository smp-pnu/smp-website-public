import type { ReactNode } from "react"
import { NavLink } from "react-router"

export function ReportCardLink({ href, children }: { href: string; children: ReactNode }) {
  return <NavLink to={href}
    className={({ isPending }) => `research-card${isPending ? " report-opening" : ""}`}>
    {({ isPending }) => <>{children}{isPending && <span role="status" className="report-opening-status">리포트를 여는 중입니다…</span>}</>}
  </NavLink>
}
