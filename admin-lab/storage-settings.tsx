import { useCallback, useEffect, useRef, useState } from "react"
import { HardDrive, RefreshCw, Upload } from "lucide-react"
import { api } from "./server-storage"
import { reauthenticate } from "./reauthenticate"
import { sizeLabel } from "./model"

type Status = {
  configured: boolean
  accountConfigured: boolean
  connected: boolean
  email: string | null
  folderName: string | null
  pending: boolean
  pendingCleanup: number
  cleanupErrors: number
}
export function StorageSettings({
  onBusy,
  onChange,
  onReturnUpload,
}: {
  onBusy: (busy: boolean) => void
  onChange: () => void
  onReturnUpload?: () => void
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message,setMessage] = useState("")
  const [quota, setQuota] = useState<{ limit: number; usage: number; remaining: number } | null>(
    null,
  )
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    const value = await (await api("/storage/status")).json()
    if (alive.current) setStatus(value)
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh().catch((e) => {
      if (alive.current) setError(e.message)
    })
    return () => {
      alive.current = false
    }
  }, [refresh])
  useEffect(() => {
    onBusy(busy)
    return () => onBusy(false)
  }, [busy, onBusy])
  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await work()
      await refresh()
      onChange()
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>파일 저장소</h1>
          <p>원본 보관 위치와 연결 상태, 삭제 대기 자료를 확인합니다.</p>
        </div>
      </header>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message&&<p className="success-panel" role="status">{message}</p>}
      {onReturnUpload&&<div className="settings-note"><p>PDF 등록에서 저장소 연결을 확인하고 있습니다. 연결을 마친 뒤 등록을 계속하세요. 선택했던 파일은 다시 선택해야 합니다.</p><button disabled={busy||!status?.connected||status.pending} onClick={onReturnUpload}>PDF 등록 계속하기</button></div>}
      {status?.pending&&<p className="settings-note" role="status">Google 승인은 받았지만 아직 연결을 저장하지 않았습니다. 아래 ‘Drive 연결 완료’를 눌러 주세요.</p>}
      {!status ? (
        <p role="status">저장소 상태를 확인하는 중…</p>
      ) : (
        <div className="settings-grid">
          <section className="settings-panel">
            <header>
              <h2>
                <HardDrive size={18} /> PDF 원본
              </h2>
              <span>{status.connected ? "Drive 연결됨" : "기존 시험 DB"}</span>
            </header>
            <p className="section-description">
              {status.connected
                ? `${status.email}의 ‘${status.folderName}’에 새 원본을 비공개로 저장합니다. 기존 자료는 현재 위치에서 유지합니다.`
                : "Drive를 연결하면 새 PDF 원본을 학회 계정에 보관하고, 관리자 DB에는 글 정보와 표지만 저장합니다."}
            </p>
            {!status.accountConfigured && (
              <p className="settings-note">
                학회 계정 허용 목록을 서버에 설정해야 연결할 수 있습니다.
              </p>
            )}
            {!status.configured && status.accountConfigured && (
              <>
                <details>
                  <summary>최초 연결 준비</summary>
                  <ol className="handover-steps">
                    <li>
                      학회 Google Cloud 프로젝트에서 Google Drive API를 사용 설정합니다. 결제 계정을
                      추가할 필요는 없습니다.
                    </li>
                    <li>
                      Google Auth Platform에서 웹 애플리케이션 OAuth 클라이언트를 만들고 아래
                      리디렉션 주소를 등록합니다.
                      <p>
                        <code>{location.origin}/api/storage/drive/callback</code>
                      </p>
                    </li>
                    <li>
                      OAuth 클라이언트 JSON을 내려받아 아래에서 불러옵니다. 코드 저장소나 채팅에
                      올리지 마세요.
                    </li>
                  </ol>
                  <p className="field-help">
                    Google 앱이 ‘테스트’ 상태이면 Drive 연결이 7일 만에 만료될 수 있습니다. 운영 전
                    게시 상태와 인수인계 계정을 확인해야 합니다.
                  </p>
                </details>
                <label className={`secondary file-picker ${busy ? "disabled" : ""}`}>
                  <Upload size={15} /> 연결 앱 JSON 불러오기
                  <input
                    type="file"
                    accept="application/json,.json"
                    aria-label="Google OAuth 클라이언트 JSON"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (!file) return
                      void run(async () => {
                        if (file.size > 16384)
                          throw Error("OAuth 클라이언트 JSON 파일을 선택해 주세요.")
                        const data = JSON.parse(await file.text())
                        await api("/storage/drive/configure", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(data),
                        })
                      })
                    }}
                  />
                </label>
              </>
            )}
            {status.configured && (
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const { url } = await (
                        await api("/storage/drive/start", { method: "POST" })
                      ).json()
                      const target = new URL(url)
                      if (target.origin !== "https://accounts.google.com")
                        throw Error("Google 연결 주소를 확인하지 못했어요.")
                      window.location.assign(target.href)
                    })
                  }
                >
                  {status.connected ? "Google 연결 갱신" : "학회 Google 계정 연결"}
                </button>
                {status.connected && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        setQuota(await (await api("/storage/drive/quota")).json()),
                      )
                    }
                  >
                    남은 용량 확인
                  </button>
                )}
              </div>
            )}
            {status.connected && <details>
              <summary>연결 키 교체</summary>
              <p className="field-help">Google에서 같은 OAuth 앱의 새 키를 만든 뒤 JSON을 선택하세요. 기존 패스키로 본인 확인 후 새 키의 연결을 검사합니다. 실패하면 기존 설정을 유지합니다. 성공을 확인하기 전에는 Google의 이전 키를 삭제하지 마세요.</p>
              <label className={`secondary file-picker ${busy ? "disabled" : ""}`}>
                새 키 JSON 확인·교체
                <input type="file" accept="application/json,.json" aria-label="교체할 OAuth 앱 JSON" disabled={busy} onChange={e => {
                  const file = e.target.files?.[0]; e.target.value=""; if(!file)return
                  void run(async () => {
                    if(file.size>16384)throw Error("OAuth 클라이언트 JSON 파일을 선택해 주세요.")
                    const client = JSON.parse(await file.text())
                    const stepUpToken = await reauthenticate("drive:rotate")
                    await api("/storage/drive/rotate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client,stepUpToken})})
                  })
                }}/>
              </label>
            </details>}
            {status.configured && <p className="field-help">Google 연결은 필요한 작업 시 자동 갱신됩니다. Google에서 접근을 철회하거나 장기간 사용하지 않아 연결이 만료되면 ‘Google 연결 갱신’으로 같은 학회 계정을 다시 승인해 주세요. 인수인계할 때는 현재 Google 앱과 전용 폴더를 유지하세요. <a href="/privacy.html">연결·보관 안내</a></p>}
            {status.pending && (
              <div className="settings-note">
                <p>
                  Google 승인이 준비됐습니다. 연결을 완료하면 학회 계정의 비공개 PDF 폴더를 사용합니다. 기존 폴더와 자료는 유지합니다.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api("/storage/drive/confirm", { method: "POST" })
                      history.replaceState(null, "", location.pathname + "#storage");
                      setMessage("Drive 연결이 완료됐습니다. PDF 등록 메뉴에서 파일을 선택해 주세요.")
                    })
                  }
                >
                  Drive 연결 완료
                </button>
              </div>
            )}
            {quota && (
              <p className="field-help">
                전체 {sizeLabel(quota.limit)} 중 {sizeLabel(quota.remaining)} 남음 · Gmail 등과 공유
              </p>
            )}
            <p className="field-help">
              새 원본 하루 10개 · PDF 한 개 32MB · 중단된 전송은 같은 파일을 다시 선택해 이어서
              처리합니다.
            </p>
          </section>
          <section className="settings-panel">
            <header>
              <h2>수정본·삭제 관리</h2>
            </header>
            <ul>
              <li>초안을 수정하거나 PDF를 교체해도 이전 승인본을 보관합니다.</li>
              <li>휴지통에서는 복원할 수 있습니다. 영구 삭제한 파일도 30일 보류 후 정리합니다.</li>
              <li>
                다른 글에서 참조 중인 파일과 기존 Notion 원본은 새 삭제 기능이 지우지 않습니다.
              </li>
            </ul>
            <p>
              파일 정리 대기 <strong>{status.pendingCleanup}개</strong> · 확인 필요{" "}
              <strong>{status.cleanupErrors}개</strong>
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/storage/maintenance", { method: "POST" })
                })
              }
            >
              <RefreshCw size={15} /> 정리 상태 확인
            </button>
            <p className="field-help">
              관리자 접속 시 시간당 한 번, 최대 2개씩 정리합니다. 실패한 작업은 원본 연결을 남기며
              3회 이후 자동 재시도를 멈춥니다.
            </p>
            <div className="settings-note">
              게시 관리에서 승인한 내용만 공개됩니다. 보관 중인 PDF는 해당 게시물의 휴지통 보관 기간이 지난 뒤 정리합니다.
            </div>
          </section>
        </div>
      )}
    </>
  )
}
