import { useEffect, useState, type ReactNode } from "react"
import { LockKeyhole, ShieldCheck } from "lucide-react"
import { api, setApiSession, type Session } from "./server-storage"
export function AuthGate({ children }: { children: (session: Session, logout: () => Promise<void>) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [setup, setSetup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [setupKey, setSetupKey] = useState("")
  useEffect(() => {
    let active = true
    void api("/session").then(r => r.json()).then(data => {
      if (active) { setApiSession(data.session); setSession(data.session); setSetup(data.setupRequired) }
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    const expired = () => { setApiSession(null); setSession(null); setError("세션이 만료됐어요. 다시 로그인해 주세요.") }
    window.addEventListener("admin-session-expired", expired)
    return () => { active = false; window.removeEventListener("admin-session-expired", expired) }
  }, [])
  const logout = async () => {
    await api("/logout", { method: "POST" }); setApiSession(null); setSession(null); setError(""); setPassword("")
  }
  if (loading) return <main className="auth-shell"><p>로그인 상태를 확인하고 있어요…</p></main>
  if (session) return children(session, logout)
  return <main className="auth-shell"><section className="auth-card">
    <div className="admin-brand"><strong>SMP</strong><span>사이트 관리</span></div>
    <div className="auth-heading"><LockKeyhole size={22}/><div><h1>{setup ? "첫 관리자 설정" : "관리자 로그인"}</h1></div></div>
    <p className="auth-intro">PDF와 초안을 관리하는 별도 시험 서버입니다. 운영 사이트에는 게시되지 않습니다.</p>
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      setError("")
      if (setup && password !== repeat) { setError("비밀번호 확인이 일치하지 않아요."); return }
      setBusy(true)
      try {
        const next = await (await api(setup ? "/setup" : "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, ...(setup ? { setupKey } : {}) }) })).json()
        setApiSession(next); setSession(next); setSetup(false); setPassword(""); setRepeat(""); setSetupKey("")
      } catch (e) { setError(e instanceof Error ? e.message : "로그인하지 못했어요.") }
      finally { setBusy(false) }
    }}>
      <fieldset disabled={busy} className="auth-fields">
        {setup && <label>초기 설정 키<input type="password" autoComplete="off" value={setupKey} onChange={e => setSetupKey(e.target.value)} required maxLength={100}/><small>서버 폴더의 setup-key.txt에 있는 일회용 키입니다.</small></label>}
        <label>관리자 아이디<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9._@-]{2,63}"/></label>
        <label>비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={setup ? "new-password" : "current-password"} required minLength={setup ? 10 : undefined} maxLength={128}/>{setup && <small>10자 이상의 긴 비밀번호를 사용해 주세요.</small>}</label>
        {setup && <label>비밀번호 확인<input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} autoComplete="new-password" required minLength={10} maxLength={128}/></label>}
        {error && <p className="error-panel" role="alert">{error}</p>}
        <button className="primary" type="submit">{busy ? "확인 중…" : setup ? "관리자 설정하고 시작" : "로그인"}</button>
      </fieldset>
    </form>
    <p className="auth-note"><ShieldCheck size={16}/> 이 Mac의 시험 서버에만 연결됩니다. 기존 학회 계정의 비밀번호를 그대로 사용하지 마세요.</p>
  </section></main>
}
