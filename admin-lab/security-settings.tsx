import { LoadingState, InlineLoading } from "./ui/loading";
import type { FormEvent } from "react"
import { KeyRound, ArrowUpRight } from "lucide-react"
export type PasskeyItem = { id: string; label: string; created: number }
type Props = { keys: PasskeyItem[]; busy: boolean; label: string; error: string; onLabel: (value: string) => void; onRegister: () => void; onRemove: (id: string) => void }
export type SecurityControls = Props & {onOpen:()=>void}
export function SecuritySettings({ keys, busy, label, error, onLabel, onRegister, onRemove }: Props) {
  return <>
    <header className="page-heading"><div><h1>로그인·인수인계</h1><p>등록한 패스키를 관리하고 다음 담당자에게 접근 권한을 넘깁니다.</p></div></header>
    {error && <p className="error-panel" role="alert">{error}</p>}
    <div className="settings-grid">
      <section className="settings-panel"><header><h2>등록된 패스키</h2><span>{busy&&!keys.length?<InlineLoading>확인 중</InlineLoading>:`${keys.length} / 5`}</span></header>
        <p className="section-description">패스키는 개인 기기나 암호 관리자에 저장됩니다. 웹사이트 자료는 학회 서버에 별도로 보관됩니다.</p>
        {busy&&!keys.length&&<LoadingState label="등록된 패스키를 확인하는 중…" rows={2}/>}
        <ul className="passkey-list">{keys.map(key => <li key={key.id}><KeyRound size={18}/><div><strong>{key.label}</strong><span>{new Date(key.created).toLocaleDateString("ko-KR")} 등록</span></div><button className="text-button danger-text" disabled={busy || keys.length <= 1} onClick={() => onRemove(key.id)}>해제</button></li>)}</ul>
        <form className="add-key-form" onSubmit={(e: FormEvent) => { e.preventDefault(); onRegister() }}><fieldset disabled={busy} className="auth-fields"><label>패스키 이름<input value={label} onChange={e => onLabel(e.target.value)} placeholder="예: 관리자 휴대폰" maxLength={60} required/></label><button className="secondary" disabled={keys.length >= 5}>패스키 추가</button></fieldset></form>
        <p className="field-help">추가·해제 전에 기존 패스키로 본인을 확인합니다. 추가 시 두 번째 인증 창에서 ‘다른 기기 사용’을 선택하세요. 마지막 패스키는 해제할 수 없습니다.</p>
      </section>
      <section className="settings-panel handover-panel"><header><h2>다음 관리자에게 인수인계</h2></header>
        <p className="section-description">내 패스키나 개인 Apple·Google 계정을 공유하지 않고, 새 관리자의 패스키로 교체합니다.</p>
        <ol className="handover-steps"><li><strong>복구 코드 전달</strong><p>처음 등록할 때 보관한 복구 코드를 다음 관리자에게 안전하게 전달합니다.</p></li><li><strong>새 관리자의 기기에서 등록</strong><p>로그인 화면의 ‘복구·인수인계’에서 전달받은 코드를 입력하고 본인의 패스키를 등록합니다.</p></li><li><strong>새 복구 코드 보관</strong><p>등록이 완료되면 이전 패스키·로그인이 모두 해제됩니다. 기존 복구 코드도 무효가 됩니다.</p></li></ol>
        <div className="settings-note">저장된 리포트는 유지됩니다. 패스키만 추가하는 것은 기존 관리자의 권한을 회수하지 않습니다.</div>
        <a className="text-link" href="/#handoff" target="_blank" rel="noopener noreferrer">복구·인수인계 화면 안내<ArrowUpRight size={15}/></a>
      </section>
    </div>
  </>
}
