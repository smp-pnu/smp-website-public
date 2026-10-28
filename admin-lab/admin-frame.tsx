import type { ReactNode } from "react"
import { FileText, KeyRound, ExternalLink, LogOut, Megaphone, HardDrive, Users, Calendar, Upload, LayoutDashboard } from "lucide-react"
import { cloudMode, serverMode } from "./mode"
import { limits, sizeLabel } from "./model"

type Props = {
  children: ReactNode
  embedded?: boolean
  active: "reports" | "security" | "notices" | "storage" | "members" | "recruitment" | "dashboard" | "upload"
  onDashboard?: () => void
  cmsEnabled?: boolean
  cmsActive?: boolean
  onMembers?: () => void
  onRecruitment?: () => void
  onUpload?: () => void
  onReports?: () => void
  onNotices?: () => void
  onSecurity?: () => void
  onStorage?: () => void
  onLogout?: () => Promise<void>
  busy?: boolean
  stored?: number
  count?: number
  countLimit?: number
}
export function AdminFrame({
  children,
  embedded,
  active, cmsEnabled, cmsActive, onMembers, onRecruitment, onUpload, onDashboard,
  onReports,
  onNotices,
  onSecurity,
  onStorage,
  onLogout,
  busy,
  stored,
  count,
  countLimit = limits.drafts,
}: Props) {
  if (embedded) return <>{children}</>
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        본문으로 이동
      </a>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <strong>SMP</strong>
          <span>사이트 관리</span>
        </div>
        <nav aria-label="관리 메뉴">
          {onDashboard && <button className={active==='dashboard'?'active':''} aria-current={active==='dashboard'?'page':undefined} disabled={busy} onClick={onDashboard}><LayoutDashboard size={17}/>운영 현황</button>}
          <button
            className={active === "reports" ? "active" : ""}
            aria-current={active === "reports" ? "page" : undefined}
            disabled={busy}
            onClick={onReports}
          >
            <FileText size={17} />
            리포트
          </button>
          {onNotices && (
            <button
              className={active === "notices" ? "active" : ""}
              aria-current={active === "notices" ? "page" : undefined}
              disabled={busy}
              onClick={onNotices}
            >
              <Megaphone size={17} />
              공지사항
            </button>
          )}
          {onMembers && <button className={active==='members'?'active':''} aria-current={active==='members'?'page':undefined} onClick={onMembers} disabled={busy}><Users size={17}/>회원 명단</button>}
          {onRecruitment && <button className={active==='recruitment'?'active':''} aria-current={active==='recruitment'?'page':undefined} onClick={onRecruitment} disabled={busy}><Calendar size={17}/>모집 안내</button>}
          {onUpload && <button className={active==='upload'?'active':''} aria-current={active==='upload'?'page':undefined} onClick={onUpload} disabled={busy}><Upload size={17}/>PDF 등록</button>}
          {onSecurity && (
            <button
              className={active === "security" ? "active" : ""}
              aria-current={active === "security" ? "page" : undefined}
              disabled={busy}
              onClick={onSecurity}
            >
              <KeyRound size={17} />
              로그인·인수인계
            </button>
          )}
          {onStorage && (
            <button
              className={active === "storage" ? "active" : ""}
              aria-current={active === "storage" ? "page" : undefined}
              disabled={busy}
              onClick={onStorage}
            >
              <HardDrive size={17} />
              파일 저장소
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          {stored !== undefined && (
            <div className="storage-meter">
              <div>
                <span>공유 시험 저장 공간</span>
                <span>
                  리포트 {count} / {countLimit}개
                </span>
              </div>
              <progress value={stored} max={limits.totalBytes} aria-label="시험 자료 저장 용량" />
              <small>
                {sizeLabel(stored)} / {sizeLabel(limits.totalBytes)}
              </small>
            </div>
          )}
          <a href="https://pnusmp.com" target="_blank" rel="noopener noreferrer">
            공식 홈페이지
            <ExternalLink size={14} />
          </a>
          {onLogout && (
            <button className="logout-button" disabled={busy} onClick={() => void onLogout()}>
              <LogOut size={15} />
              로그아웃
            </button>
          )}
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>부산대학교 금융투자학회</span>
          <div>
            <span className="environment-badge">
              {cmsEnabled ? (cmsActive ? "공식 사이트 관리" : "전환 준비") : cloudMode ? "관리자" : serverMode ? "로컬 서버 시험" : "로컬 시험"}
            </span>
            <span className="environment-note">{cmsEnabled ? (cmsActive ? "승인한 내용만 게시됩니다" : "공식 사이트 전환 전") : "입력 승인 후 게시 관리에서 공개합니다"}</span>
          </div>
        </header>
        <main id="admin-main" className="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
