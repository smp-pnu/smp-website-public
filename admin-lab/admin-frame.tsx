import type { ReactNode } from "react"
import { FileText, KeyRound, ExternalLink, LogOut } from "lucide-react"
import { cloudMode, serverMode } from "./mode"
import { limits, sizeLabel } from "./model"

type Props = {
  children: ReactNode; active: "reports" | "security";
  onReports?: () => void; onSecurity?: () => void; onLogout?: () => Promise<void>;
  busy?: boolean; stored?: number; count?: number;
}
export function AdminFrame({ children, active, onReports, onSecurity, onLogout, busy, stored, count }: Props) {
  return <div className="admin-shell">
    <a className="skip-link" href="#admin-main">본문으로 이동</a>
    <aside className="admin-sidebar">
      <div className="admin-brand"><strong>SMP</strong><span>사이트 관리</span></div>
      <nav aria-label="관리 메뉴">
        <button className={active === "reports" ? "active" : ""} aria-current={active === "reports" ? "page" : undefined} disabled={busy} onClick={onReports}><FileText size={17}/>리포트</button>
        {onSecurity && <button className={active === "security" ? "active" : ""} aria-current={active === "security" ? "page" : undefined} disabled={busy} onClick={onSecurity}><KeyRound size={17}/>로그인·인수인계</button>}
      </nav>
      <div className="sidebar-bottom">
        {stored !== undefined && <div className="storage-meter"><div><span>시험 저장 공간</span><span>{count} / {limits.drafts}개</span></div><progress value={stored} max={limits.totalBytes} aria-label="시험 자료 저장 용량"/><small>{sizeLabel(stored)} / {sizeLabel(limits.totalBytes)}</small></div>}
        <a href="https://pnusmp.com" target="_blank" rel="noopener noreferrer">공식 홈페이지<ExternalLink size={14}/></a>
        {onLogout && <button className="logout-button" disabled={busy} onClick={() => void onLogout()}><LogOut size={15}/>로그아웃</button>}
      </div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><span>부산대학교 금융투자학회</span><div><span className="environment-badge">{cloudMode ? "온라인 시험" : serverMode ? "로컬 서버 시험" : "로컬 시험"}</span><span className="environment-note">운영 사이트 게시 안 됨</span></div></header>
      <main id="admin-main" className="admin-main" tabIndex={-1}>{children}</main>
    </div>
  </div>
}
