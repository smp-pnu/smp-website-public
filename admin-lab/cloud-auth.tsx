import { LoadingState, InlineLoading } from "./ui/loading";
import { useEffect, useState, type ReactNode } from "react"
import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import { api, setApiSession, type Session } from "./server-storage"
import { useConfirmation } from "./confirm"
import { normalizeAdminCode, parseRecoveryFile } from "./recovery-code"
import { passkeyLoginOptions, type PasskeyLoginMethod } from "./passkey-login"
import { PasskeySignIn } from "./passkey-sign-in"

import { reauthenticate } from "./reauthenticate"
import type { PasskeyItem, SecurityControls } from "./security-settings"
const post = async (path: string, data: unknown = {}) => (await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json()
const message = (error: unknown) => error instanceof Error && error.name === "NotAllowedError" ? "패스키 인증이 취소됐거나 시간이 지났어요. 다시 시도해 주세요." : error instanceof Error ? error.message : "인증을 마치지 못했어요."
export function CloudAuthGate({ children }: { children: (session: Session, logout: () => Promise<void>, security: SecurityControls) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [setup, setSetup] = useState(false)
  const [recover, setRecover] = useState(false)
  const [token, setToken] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loginMethod, setLoginMethod] = useState<PasskeyLoginMethod>("device")
  const [keys, setKeys] = useState<PasskeyItem[]>([])
  const [recoveryCode, setRecoveryCode] = useState("")
  const [saved, setSaved] = useState(false)
  const confirm = useConfirmation()
  const accept = (value: Session | null) => { setApiSession(value); setSession(value) }
  useEffect(() => {
    let active = true
    const expired = () => { accept(null) }
    window.addEventListener("admin-session-expired", expired)
    void (async () => {
      try {
        const status = await (await api("/auth/status")).json()
        if (!active) return
        setSetup(status.setupRequired)
        if (!status.setupRequired && location.hash === "#handoff") { setRecover(true); history.replaceState(null, "", location.pathname); return }
        // One-time setup key is never placed in a query string or sent to assets.
        if (status.setupRequired && location.hash.startsWith("#setup=")) {
          setToken(location.hash.slice(7)); history.replaceState(null, "", location.pathname)
        }
        if (!status.setupRequired) {
          try { const value = await (await api("/session")).json(); if (active) accept(value.session) }
          catch { /* An unsigned browser starts at the normal sign-in screen. */ }
        }
      } catch (e) { if (active) setError(message(e)) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false; window.removeEventListener("admin-session-expired", expired) }
  }, [])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError("")
    try { await action() } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const register = async (mode: "setup" | "recover" | "add") => {
    const code = mode === "add" ? "" : normalizeAdminCode(token)
    const stepUpToken = mode === "add" ? await reauthenticate("key:add") : undefined
    const optionsJSON = await post("/auth/register/options", { mode, token: code, stepUpToken })
    const response = await startRegistration({ optionsJSON })
    const result = await post("/auth/register/verify", { response, label })
    accept(result.session); setSetup(false); setRecover(false); setToken(""); setLabel("")
    if (result.recoveryCode) { setRecoveryCode(result.recoveryCode); setSaved(false) }
    if (mode === "add") setKeys(await (await api("/auth/keys")).json())
  }
  const logout = async () => { await api("/logout", { method: "POST" }); accept(null); setError("") }
  const login = async (method: PasskeyLoginMethod) => {
    setLoginMethod(method)
    const optionsJSON = passkeyLoginOptions(await post("/auth/login/options"), method)
    const response = await startAuthentication({ optionsJSON })
    accept((await post("/auth/login/verify", { response })).session)
  }
  if (loading) return <main className="auth-shell"><section className="auth-card"><div className="admin-brand"><strong>SMP</strong><span>사이트 관리</span></div><LoadingState label="로그인 상태를 확인하고 있어요…" rows={2}/></section></main>
  if (recoveryCode) return <main className="auth-shell"><section className="auth-card">
    <h1>복구 코드를 보관해 주세요</h1><p>기기 분실 또는 관리자 인수인계에 쓰는 일회용 코드입니다. 이 화면을 닫으면 다시 확인할 수 없으므로 안전한 곳에 보관하세요.</p>
    <label className="recovery-code">복구 코드<input readOnly value={recoveryCode} onFocus={e => e.target.select()} aria-label="복구 코드"/></label>
    <button className="secondary" onClick={() => {
      const url = URL.createObjectURL(new Blob([`SMP PDF 관리자 시험판 복구 코드\n${location.origin}\n\n${recoveryCode}\n\n기기 분실 시 로그인 화면의 ‘복구·인수인계’에서 사용하세요. 기존 패스키와 로그인은 해제되며 자료는 유지됩니다.\n`], { type: "text/plain;charset=utf-8" }))
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "SMP-관리자-복구코드.txt"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }}>복구 코드 파일 저장</button>
    <label className="auth-note"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)}/> 다른 안전한 곳에 보관했습니다.</label>
    <button className="primary" disabled={!saved} onClick={() => setRecoveryCode("")}>관리자 화면으로</button>
  </section></main>
  if (session) return children(session, logout, {keys, busy, label, error, onLabel:setLabel,
    onOpen:()=>void run(async()=>setKeys(await (await api("/auth/keys")).json())),
    onRegister:()=>void run(()=>register("add")),
    onRemove:id => void run(async () => {
      if (!await confirm("이 패스키와 해당 패스키로 로그인한 세션을 해제할까요?")) return
      await post("/auth/keys/remove", { id, stepUpToken: await reauthenticate(`key:remove:${id}`) }); setKeys(await (await api("/auth/keys")).json())
      try { await api("/session") } catch { accept(null) }
    })})
  return <main className="auth-shell"><section className="auth-card">
    <div className="admin-brand"><strong>SMP</strong><span>사이트 관리</span></div>
    <h1>{setup ? "첫 관리자 패스키 등록" : recover ? "복구·인수인계" : "관리자 로그인"}</h1>
    <p className="auth-intro">{recover ? "패스키 등록 때 보관한 64자리 복구 코드가 필요합니다. 로컬 시험판의 아이디·비밀번호를 입력하는 곳이 아닙니다." : "등록한 패스키로 로그인하세요. 게시 관리에서 승인한 내용만 공식 홈페이지에 반영됩니다."}</p>
    <form onSubmit={e => { e.preventDefault(); void run(async () => {
      if (setup || recover) return register(setup ? "setup" : "recover")
      return login("device")
    }) }}><fieldset disabled={busy} className="auth-fields">
      {(setup || recover) && <><label>{setup ? "초기 설정 키 (64자리)" : "복구 코드 (64자리)"}<input type="password" value={token} onChange={e => { setToken(e.target.value.trim()); setError("") }} autoComplete="off" spellCheck={false} required minLength={64} maxLength={64} pattern="[a-fA-F0-9]{64}" aria-describedby={recover ? "recovery-help" : undefined} onInvalid={e => { e.preventDefault(); setError("64자리 코드를 입력해 주세요. 로컬 시험판 비밀번호와는 다릅니다.") }}/></label>
      {recover && <><small id="recovery-help">다운로드 폴더의 ‘SMP-관리자-복구코드.txt’를 불러오거나 파일 안의 64자리 코드를 입력하세요.</small>
      <label>복구 코드 파일 불러오기<input type="file" accept=".txt,text/plain" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return
        setToken("")
        void run(async () => {
          if (file.size > 4096) throw new Error("관리자 등록 때 저장한 복구 코드 .txt 파일을 선택해 주세요.")
          setToken(parseRecoveryFile(await file.text()))
        })
      }}/></label></>}
      <label>기기 이름<input value={label} onChange={e => setLabel(e.target.value)} placeholder="예: 관리자 Mac" required maxLength={60}/></label></>}
      {recover && <p>복구를 완료하면 기존 패스키와 모든 로그인이 해제됩니다. 저장한 리포트는 유지됩니다.</p>}
      {error && <p className="error-panel" role="alert">{error}</p>}
      {setup || recover ? <button className="primary">{busy ? <InlineLoading>기기 인증을 기다리고 있어요…</InlineLoading> : setup ? "패스키 등록하고 시작" : "새 관리자 패스키 등록"}</button>
        : <PasskeySignIn busy={busy} method={loginMethod} onPhone={() => void run(() => login("phone"))}/>}
    </fieldset></form>
    {!setup && <button className="secondary" disabled={busy} onClick={() => { setRecover(!recover); setToken(""); setError("") }}>{recover ? "로그인으로 돌아가기" : "복구·인수인계"}</button>}
    {!setup && !recover && <p className="auth-note">로그인한 브라우저에서 24시간 유지됩니다. 로그아웃하면 즉시 종료됩니다.</p>}
    <p className="auth-note">Touch ID·기기 잠금번호는 서버에 전달되지 않습니다.</p>
    <p className="auth-note"><a href="/privacy.html">Google Drive 연결 및 개인정보 안내</a></p>
  </section></main>
}
