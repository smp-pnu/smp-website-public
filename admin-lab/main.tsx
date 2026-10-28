import { Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import "./style.css"
import { CloudAuthGate } from "./cloud-auth"
import { AuthGate } from "./auth"
import { cloudMode, serverMode, storageLabel, allowedTrialOrigin, legacyAdminDestination } from "./mode"
import { App } from "./app"
import { ConfirmationProvider } from "./confirm"

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <main className="fatal"><h1>시험 화면을 다시 열어 주세요.</h1><p>이미 저장된 초안은 {storageLabel}에 남아 있습니다.</p><button onClick={() => location.reload()}>새로고침</button></main> : this.props.children
  }
}
// Build isolation only; the API independently verifies passkeys and sessions.
const allowed = allowedTrialOrigin(location.origin)
const destination = legacyAdminDestination(location.origin)
if (destination) location.replace(destination)
createRoot(document.getElementById("root")!).render(allowed ? <ErrorBoundary><ConfirmationProvider>{cloudMode ? <CloudAuthGate>{(session, logout, security) => <App username={session.username} onLogout={logout} security={security}/>}</CloudAuthGate> : serverMode ? <AuthGate>{(session, logout) => <App username={session.username} onLogout={logout}/>}</AuthGate> : <App/>}</ConfirmationProvider></ErrorBoundary> : <main className="fatal"><h1>허용된 시험 주소에서 열어 주세요.</h1><p>이 빌드는 현재 주소에서 실행할 수 없습니다.</p></main>)
