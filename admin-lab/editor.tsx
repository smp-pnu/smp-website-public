import { cloudMode, serverMode, storageLabel } from "./mode"
import { useEffect, useState } from "react"
import { Check, Download, FileCheck2, RotateCcw, Save, Trash2 } from "lucide-react"
import { wicsSectors } from "../lib/wics"
import { reviewErrors, reportSummary, sizeLabel, statusOf, type Draft, type Fields } from "./model"
import { downloadOriginal, useCover } from "./use-lab"
import { useConfirmation } from "./confirm"
import { api } from "./server-storage"
import { readAssets as readCloudAssets } from "./cloud-storage"

type Props = {
  draft: Draft
  locked: boolean
  workflow?: boolean
  onBusy?: (busy: boolean) => void
  onDirty: (dirty: boolean) => void
  onSave: (draft: Draft, fields: Fields) => Promise<void>
  onApprove: (draft: Draft, reviewed: boolean) => Promise<void>
  onTrash: (draft: Draft, trashed: boolean) => Promise<void>
  onRemove: (draft: Draft) => Promise<void>
  onReanalyze: (draft: Draft) => Promise<void>
  onReplace: (draft: Draft, file: File) => Promise<void>
}
const labels: Record<keyof Fields, string> = {
  title: "리포트 제목",
  company: "기업명",
  ticker: "종목코드",
  date: "발표일",
  semester: "학기",
  author: "작성자 · 팀",
  industry: "업종",
  reportType: "리포트 분류",
  targetYear: "목표연도",
  targetPrice: "목표주가",
  upside: "상승여력",
  notRated: "Not Rated",
}

export function DraftEditor({
  draft,
  locked,
  workflow,
  onBusy,
  onDirty,
  onSave,
  onApprove,
  onTrash,
  onRemove,
  onReanalyze,
  onReplace,
}: Props) {
  const confirm = useConfirmation()
  const [fields, setFields] = useState(draft.fields)
  const [reviewed, setReviewed] = useState(false)
  const [actionBusy, setBusy] = useState(false)
  useEffect(()=>{onBusy?.(actionBusy);return()=>onBusy?.(false)},[actionBusy,onBusy])
  const busy = actionBusy || locked
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"edit" | "preview">("edit")
  const cover = useCover(draft.id)
  const dirty = JSON.stringify(fields) !== JSON.stringify(draft.fields)
  const missing = reviewErrors(fields)
  const approved = draft.approvedRevision === draft.revision
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const update = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((previous) =>
      key === "notRated" && value
        ? { ...previous, notRated: true, targetPrice: "", upside: "" }
        : { ...previous, [key]: value },
    )
    setReviewed(false)
    setError("")
  }
  const action = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }
  const input = (
    name: Exclude<keyof Fields, "notRated" | "reportType" | "industry">,
    type = "text",
    placeholder = "",
  ) => (
    <label className={name === "title" ? "span-2" : ""} key={name}>
      <span>{labels[name]}</span>
      <input
        name={name}
        value={fields[name]}
        type={type}
        placeholder={placeholder}
        maxLength={name === "title" ? 200 : 100}
        onChange={(e) => update(name, e.target.value)}
        disabled={busy || !!draft.trashedAt}
        autoComplete="off"
      />
    </label>
  )
  return (
    <section className="editor" aria-label="리포트 검토">
      <header className="editor-heading">
        <div>
          <h1 tabIndex={-1}>{draft.trashedAt ? "휴지통의 리포트" : "리포트 편집"}</h1>
        </div>
        <span className={`status ${approved ? "approved" : ""}`}>
          {dirty ? "저장 전 변경" : statusOf(draft)}
        </span>
      </header>
      <div className="file-strip">
        <FileCheck2 size={17} />
        <span title={draft.filename}>{draft.filename}</span>
        <small>
          {draft.pages}쪽 · {sizeLabel(draft.fileBytes)}
        </small>
      </div>
      <div className="editor-tabs" aria-label="검토 화면">
        <button aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>
          내용 편집
        </button>
        <button aria-pressed={tab === "preview"} onClick={() => setTab("preview")}>
          게시물 미리보기
        </button>
        {cloudMode && !draft.trashedAt && (
          <label className={`secondary file-picker ${busy || dirty ? "disabled" : ""}`}>
            PDF 교체
            <input
              type="file"
              aria-label="교체할 PDF 선택"
              accept=".pdf,application/pdf"
              disabled={busy || dirty}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (
                  file &&
                  (await confirm(
                    "PDF와 표지를 새 파일로 교체할까요? 기존 제목·분류·순서는 유지합니다. 이전 승인본은 보관하며, 새 원문을 검토한 후 다시 승인할 수 있습니다.",
                  ))
                )
                  void action(() => onReplace(draft, file))
              }}
            />
          </label>
        )}
        <button
          className="download"
          disabled={busy}
          onClick={() => action(() => downloadOriginal(draft))}
        >
          <Download size={15} /> 원본 PDF
        </button>
      </div>
      {cloudMode && draft.release && !draft.trashedAt && (
        <div className="settings-note">
          <p>
            <strong>보관된 승인본 · 버전 {draft.release.revision}</strong>
            <br />
            {draft.release.title}
          </p>
          {draft.release.revision !== draft.revision && (
            <p>현재 초안과 별도로 보관합니다. 다시 승인하기 전까지 이 승인본은 바뀌지 않습니다.</p>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const approved = await (await api(`/drafts/${draft.id}/release`)).json()
                const assets = await readCloudAssets(draft.id, true),
                  url = URL.createObjectURL(assets.pdf),
                  a = document.createElement("a")
                a.href = url
                a.download = approved.draft.filename
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 60_000)
              })
            }
          >
            승인본 PDF 확인
          </button>
        </div>
      )}
      {tab === "preview" ? (
        <article className="article-preview">
          <div className="preview-note">미리보기 · 실제 웹사이트에는 게시되지 않습니다</div>
          <p className="preview-category">리포트 · {fields.semester || "학기 미입력"}</p>
          <h1>{fields.title || "제목을 입력해 주세요"}</h1>
          <p className="article-meta">
            {fields.company} {fields.ticker && `(${fields.ticker})`} ·{" "}
            {fields.date || "발표일 미입력"} · {fields.author || "작성자 미입력"}
          </p>
          <div className="article-tags">
            <span>{fields.reportType}</span>
            {fields.industry && <span>{fields.industry}</span>}
          </div>
          <p className="summary">
            {reportSummary(fields) || "목표주가 또는 Not Rated를 검토해 주세요."}
          </p>
          {cover ? (
            <img className="article-cover" src={cover} alt={`${fields.title} 첫 페이지`} />
          ) : (
            <p>표지를 불러오는 중…</p>
          )}
          <p className="muted">
            검토 화면에서는 첫 페이지만 미리 보여 줍니다. 전체 원문은 위의 ‘원본 PDF’로 확인할 수
            있습니다.
          </p>
        </article>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void action(() => onSave(draft, fields))
          }}
        >
          <div className="review-intro">
            <div className="cover-paper">
              {cover ? <img src={cover} alt="업로드한 PDF 첫 페이지" /> : <span>표지 준비 중</span>}
            </div>
            <div>
              <h3>PDF에서 추출한 정보</h3>
              <p>첫 3페이지와 파일명을 기준으로 입력했습니다. 저장 전 원문과 대조하세요.</p>
              <small>표지와 원본은 같은 PDF를 사용합니다.</small>
            </div>
          </div>
          <fieldset disabled={busy || !!draft.trashedAt}>
            <legend>기본 정보</legend>
            <div className="field-grid">
              {input("title", "text", "첫 페이지의 소개 문구를 포함한 제목")}
              {input("company", "text", "예: 인바디")}
              {input("ticker", "text", "앞자리 0을 포함한 6자리")}
              {input("date", "date")}
              {input("semester", "text", "예: 2026-2")}
              {input("author", "text", "예: 리서치 1팀")}
              <label>
                <span>리포트 분류</span>
                <select
                  value={fields.reportType}
                  onChange={(e) => update("reportType", e.target.value as Fields["reportType"])}
                >
                  <option>기업분석</option>
                  <option>산업분석</option>
                </select>
              </label>
              <label className="span-2">
                <span>
                  업종 <small>기존 분류표 · 직접 확인</small>
                </span>
                <select
                  value={fields.industry}
                  onChange={(e) => update("industry", e.target.value)}
                >
                  <option value="">미지정</option>
                  {fields.industry &&
                    !wicsSectors.some((sector) =>
                      sector.industries.some((industry) => industry === fields.industry),
                    ) && <option value={fields.industry}>{fields.industry} · 직접 입력</option>}
                  {wicsSectors.map((sector) => (
                    <optgroup label={sector.name} key={sector.name}>
                      {sector.industries.map((industry) => (
                        <option key={industry}>{industry}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset disabled={busy || !!draft.trashedAt}>
            <legend>투자 의견</legend>
            <label className="check-row">
              <input
                type="checkbox"
                checked={fields.notRated}
                onChange={(e) => update("notRated", e.target.checked)}
              />
              <span>
                Not Rated <small>목표주가를 제시하지 않은 리포트</small>
              </span>
            </label>
            <div className="field-grid">
              {input("targetYear", "text", "예: 2027")}
              {!fields.notRated && (
                <>
                  {input("targetPrice", "text", "예: 50,000원")}
                  {input("upside", "text", "예: 25.0%")}
                </>
              )}
            </div>
            <div className="summary-preview">
              <small>웹사이트에 표시될 요약</small>
              <p>{reportSummary(fields) || "입력한 내용으로 요약이 준비됩니다."}</p>
            </div>
          </fieldset>
          <details className="evidence">
            <summary>
              자동 입력 근거와 확인 사항 <span>{draft.evidence.length}개 근거</span>
            </summary>
            <p className="muted">
              업로드 시점의 추출 기록입니다. 이후 직접 수정한 값은 이 기록과 다를 수 있어요.
            </p>
            {draft.warnings.length > 0 && (
              <ul className="warnings">
                {draft.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <dl>
              {draft.evidence.map((item, i) => (
                <div key={`${item.field}-${i}`}>
                  <dt>
                    {labels[item.field]}{" "}
                    <small>
                      {item.page ? `${item.page}쪽 · ` : ""}
                      {item.source}
                    </small>
                  </dt>
                  <dd>{item.excerpt}</dd>
                </div>
              ))}
            </dl>
            {!draft.trashedAt && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm(
                      "직접 수정한 입력값을 PDF에서 다시 추출한 후보로 바꿀까요? 입력 승인도 해제됩니다. 원본 PDF와 표지는 유지됩니다.",
                    )
                  )
                    void action(() => onReanalyze(draft))
                }}
              >
                <RotateCcw size={15} /> 입력 후보 다시 추출
              </button>
            )}
          </details>
          {!draft.trashedAt && (
            <div className="review-actions">
              <button className="secondary" type="submit" disabled={busy || !dirty}>
                <Save size={16} />
                {busy ? "처리 중…" : "초안 저장"}
              </button>
              <span>
                {dirty
                  ? "변경한 내용을 먼저 저장해 주세요."
                  : `${storageLabel}에 저장된 초안입니다.`}
              </span>
            </div>
          )}
        </form>
      )}
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <footer className="approval">
        {draft.trashedAt ? (
          <>
            <p>{storageLabel}의 시험 자료만 변경됩니다.</p>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() => action(() => onTrash(draft, false))}
              >
                <RotateCcw size={16} /> 복원
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm(
                      cloudMode
                        ? "초안을 영구 삭제할까요? 파일은 30일 보류 후 다른 참조가 없을 때 정리합니다."
                        : `${storageLabel}에서 PDF와 초안을 영구 삭제할까요?`,
                    )
                  )
                    void action(() => onRemove(draft))
                }}
              >
                영구 삭제
              </button>
            </div>
          </>
        ) : (
          <>
            {approved && !dirty ? (
              <p className="approved-message">
                <Check size={17} /> 이 버전은 입력 승인을 완료했어요. 게시 관리에서 공개할 수 있습니다.
              </p>
            ) : (
              <>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={dirty || busy || missing.length > 0}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  <span>PDF 원문과 입력 내용을 확인했어요.</span>
                </label>
                {missing.length > 0 && (
                  <p className="validation" role="status">
                    {missing[0]}{" "}
                    {missing.length > 1 ? `외 ${missing.length - 1}개 항목 확인 필요` : ""}
                  </p>
                )}
              </>
            )}
            <div className="button-row">
              <button
                className="primary"
                disabled={busy || dirty || !reviewed || !!missing.length || approved}
                onClick={() => action(() => onApprove(draft, reviewed))}
              >
                <Check size={17} />
                {approved ? "입력 승인 완료" : workflow ? "검토 완료 · 게시 초안 만들기" : "검토 완료 · 입력 승인"}
              </button>
              <button
                className="icon-button"
                aria-label="휴지통으로 이동"
                title="휴지통으로 이동"
                disabled={busy}
                onClick={async () => {
                  if (!dirty || (await confirm("저장하지 않은 변경을 버리고 휴지통으로 옮길까요?")))
                    void action(() => onTrash(draft, true))
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <small>
              {workflow ? "검토를 마치면 리포트 초안이 열립니다. 내용을 확인하고 ‘게시’를 눌러야 공식 사이트에 공개됩니다." : "입력 승인 후 ‘게시 목록에 추가’를 눌러 게시 관리로 이동하세요. 공개하려면 게시 관리에서 ‘게시’를 눌러야 합니다."}
            </small>
          </>
        )}
      </footer>
    </section>
  )
}
