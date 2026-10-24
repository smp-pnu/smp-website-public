import { Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/noto-sans-kr"
import "./style.css"
import { App } from "./app"
import { ConfirmationProvider } from "./confirm"

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <main className="fatal"><h1>시험 화면을 다시 열어 주세요.</h1><p>이미 저장된 초안은 이 브라우저에 남아 있습니다.</p><button onClick={() => location.reload()}>새로고침</button></main> : this.props.children
  }
}
// This is not authentication. A future hosted admin requires a real server-side
// session. Refuse to run this unauthenticated prototype on a remote origin.
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
createRoot(document.getElementById("root")!).render(local ? <ErrorBoundary><ConfirmationProvider><App/></ConfirmationProvider></ErrorBoundary> : <main className="fatal"><h1>로컬 시험 전용 화면입니다.</h1><p>실제 관리자 인증을 연결하기 전에는 외부 주소에서 실행할 수 없습니다.</p></main>)
