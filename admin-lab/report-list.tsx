import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { FileText, Search, RefreshCw, ChevronRight, ArrowUp, ArrowDown, GripVertical } from "lucide-react"
import type { Draft } from "./model"
import { statusOf } from "./model"
import { useCover } from "./use-lab"
import { useReportReorder } from "./use-report-reorder"
import { pageSize, type LibraryQuery, type BatchAction, type Filter, type Sort, type DropPlacement } from "./library-model"

type Props = {
  drafts: Draft[]
  allDrafts: Draft[]
  loading: boolean
  criteria: LibraryQuery
  managed: boolean
  onCriteria: (query: LibraryQuery) => void
  onSelect: (id: string) => void
  onRefresh: () => void
  onMove: (from: string, to: string, placement?: DropPlacement) => Promise<void>
  onBatch: (items: Draft[], action: BatchAction) => Promise<void>
}
function Cover({ id }: { id: string }) {
  const cover = useCover(id)
  return (
    <span className="report-thumb">
      {cover ? <img src={cover} alt="" loading="lazy" /> : <FileText size={17} />}
    </span>
  )
}
export function ReportList({
  drafts,
  allDrafts,
  loading,
  criteria,
  managed,
  onCriteria,
  onSelect,
  onRefresh,
  onMove,
  onBatch,
}: Props) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([])
  const [field, setField] = useState<"semester" | "author" | "industry">("semester"),
    [value, setValue] = useState("")
  const reorder = useReportReorder(onMove)
  const { dragged, target: dropTarget, cancel: clearDrag } = reorder
  useEffect(() => {
    setPage(1)
    setSelected([])
  }, [criteria])
  useEffect(() => {
    clearDrag()
  }, [criteria, page, loading, clearDrag])
  const active = allDrafts.filter((d) => !d.trashedAt),
    approved = active.filter((d) => d.approvedRevision === d.revision).length
  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "전체", count: active.length },
    { value: "review", label: "검토 대기", count: active.length - approved },
    { value: "approved", label: "시험 승인", count: approved },
    { value: "trash", label: "휴지통", count: allDrafts.length - active.length },
  ]
  const source = criteria.filter === "trash" ? allDrafts.filter((d) => d.trashedAt) : active
  const options = (key: "semester" | "author" | "industry") =>
    [...new Set(source.map((d) => d.fields[key] || "미지정"))].sort((a, b) =>
      key === "semester" ? b.localeCompare(a) : a.localeCompare(b, "ko"),
    )
  const pages = Math.max(1, Math.ceil(drafts.length / pageSize)),
    current = Math.min(page, pages)
  const visible = drafts.slice((current - 1) * pageSize, current * pageSize)
  const checked = visible.filter((d) => selected.includes(d.id))
  const update = (patch: Partial<LibraryQuery>) => onCriteria({ ...criteria, ...patch })
  const manual = managed && criteria.sort === "order" && criteria.filter !== "trash"
  const moving = dragged ? drafts.find((draft) => draft.id === dragged) : null
  const batch = async (action: BatchAction) => {
    await onBatch(checked, action)
    setSelected([])
  }
  return (
    <section className="report-library" aria-label="리포트 목록">
      <nav className="list-tabs" aria-label="리포트 상태">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            aria-pressed={criteria.filter === tab.value}
            disabled={loading}
            onClick={() => update({ filter: tab.value })}
          >
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </nav>
      <nav className="semester-folders" aria-label="학기별 보관함">
        <button aria-pressed={!criteria.semester} onClick={() => update({ semester: "" })}>
          모든 학기
        </button>
        {options("semester").map((s) => (
          <button key={s} aria-pressed={criteria.semester === s} onClick={() => update({ semester: s })}>
            {s}
            <small>{source.filter((d) => (d.fields.semester || "미지정") === s).length}</small>
          </button>
        ))}
      </nav>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={criteria.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="기업·코드·제목·파일명 검색"
            aria-label="리포트 검색"
          />
        </label>
        {(["author", "industry"] as const).map((key) => (
          <label className="sort-field" key={key}>
            <span className="sr-only">{key === "author" ? "팀" : "업종"}</span>
            <select value={criteria[key]} onChange={(e) => update({ [key]: e.target.value })}>
              <option value="">{key === "author" ? "모든 팀" : "모든 업종"}</option>
              {options(key).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="sort-field">
          <span className="sr-only">정렬 기준</span>
          <select value={criteria.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
            {managed && <option value="order">직접 정한 순서</option>}
            <option value="updated">최근 수정순</option>
            <option value="date">발표일순</option>
            <option value="company">기업명순</option>
          </select>
        </label>
        <button className="icon-button" aria-label="목록 새로고침" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
      </div>
      {manual && (
        <p className="library-hint" id="report-order-help">
          <span className="drag-help">손잡이를 끌어 파란 선 위치에 놓으세요. Esc로 취소할 수 있습니다. </span>
          화살표로도 이동할 수 있으며, 순서는 놓은 뒤 자동 저장됩니다.
        </p>
      )}
      {managed && criteria.filter === "trash" && (
        <p className="library-hint">
          휴지통에 옮긴 지 30일이 지난 자료는 다음 관리자 접속·목록 조회 시 PDF와 함께 자동 정리됩니다.
        </p>
      )}
      {checked.length > 0 && (
        <div className="bulk-toolbar">
          <strong>{checked.length}개 선택 · 한 번에 최대 5개</strong>
          {criteria.filter === "trash" ? (
            <>
              <button disabled={loading} onClick={() => void batch({ type: "restore" })}>
                복원
              </button>
              <button className="danger" disabled={loading} onClick={() => void batch({ type: "remove" })}>
                영구 삭제
              </button>
            </>
          ) : (
            <>
              <select
                aria-label="일괄 수정 항목"
                value={field}
                onChange={(e) => setField(e.target.value as typeof field)}
              >
                <option value="semester">학기</option>
                <option value="author">작성자·팀</option>
                <option value="industry">업종</option>
              </select>
              <input
                aria-label="일괄 수정 값"
                placeholder={field === "semester" ? "2026-2" : "새 값 (빈칸은 미지정)"}
                value={value}
                maxLength={100}
                onChange={(e) => setValue(e.target.value)}
              />
              <button disabled={loading} onClick={() => void batch({ type: "classify", field, value })}>
                일괄 변경
              </button>
              <button disabled={loading} onClick={() => void batch({ type: "trash" })}>
                휴지통
              </button>
            </>
          )}
        </div>
      )}
      <div
        className={`report-table-wrap${dragged ? " is-reordering" : ""}`}
        ref={reorder.table}
      >
        <table className="report-table managed-table">
          <thead>
            <tr>
              {managed && (
                <th className="select-column">
                  <input
                    type="checkbox"
                    aria-label="현재 페이지 앞 5개 선택"
                    disabled={loading || !visible.length}
                    checked={!!visible.length && checked.length === Math.min(5,visible.length)}
                    onChange={(e) => setSelected(e.target.checked ? visible.slice(0,5).map((d) => d.id) : [])}
                  />
                </th>
              )}
              {manual && <th className="order-column">순서</th>}
              <th scope="col">리포트</th>
              <th scope="col">상태</th>
              <th scope="col" className="medium-column">
                학기
              </th>
              <th scope="col" className="wide-column">
                팀
              </th>
              <th className="row-arrow">
                <span className="sr-only">열기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((draft, i) => {
              const index = (current - 1) * pageSize + i
              return (
                <tr
                  key={draft.id}
                  data-report-id={draft.id}
                  className={[
                    dragged === draft.id ? "is-drag-source" : "",
                    dropTarget?.id === draft.id ? `drop-${dropTarget.placement}` : "",
                  ].filter(Boolean).join(" ") || undefined}
                >
                  {managed && (
                    <td className="select-column">
                      <input
                        type="checkbox"
                        aria-label={`${draft.fields.title || draft.filename} 선택`}
                        disabled={loading}
                        checked={selected.includes(draft.id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked ? [...old, draft.id].slice(0,5) : old.filter((id) => id !== draft.id),
                          )
                        }
                      />
                    </td>
                  )}
                  {manual && (
                    <td className="order-column">
                      <div className="order-controls">
                        <span
                          className="drag-handle"
                          onPointerDown={(event) => { if (!loading) reorder.start(event, draft.id) }}
                          onPointerMove={reorder.move}
                          onPointerUp={reorder.end}
                          onPointerCancel={clearDrag}
                          onLostPointerCapture={clearDrag}
                          aria-describedby="report-order-help"
                          title={`${draft.fields.title || draft.filename} 순서 변경: 파란 선에 놓기`}
                        >
                          <GripVertical size={14} />
                        </span>
                        <button
                          aria-label={`${draft.fields.title} 위로 이동`}
                          disabled={loading || index === 0}
                          onClick={() => void onMove(draft.id, drafts[index - 1].id)}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          aria-label={`${draft.fields.title} 아래로 이동`}
                          disabled={loading || index === drafts.length - 1}
                          onClick={() => void onMove(draft.id, drafts[index + 1].id)}
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="report-cell">
                    <button className="report-link" disabled={loading} onClick={() => onSelect(draft.id)}>
                      <Cover id={draft.id} />
                      <span>
                        <strong>{draft.fields.title || draft.filename}</strong>
                        <small>
                          {draft.fields.company || "기업 미입력"}
                          {draft.fields.ticker ? ` · ${draft.fields.ticker}` : ""} · {draft.pages}쪽 ·{" "}
                          {draft.fields.date || "날짜 미입력"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span
                      className={`status ${draft.trashedAt ? "trashed" : draft.approvedRevision === draft.revision ? "approved" : "review"}`}
                    >
                      {statusOf(draft)}
                    </span>
                  </td>
                  <td className="medium-column">{draft.fields.semester || "—"}</td>
                  <td className="wide-column">{draft.fields.author || "—"}</td>
                  <td className="row-arrow">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {moving && createPortal(
        <div ref={reorder.preview} className="report-drag-preview" style={{ transform: reorder.previewPosition() }} aria-hidden="true">
          <FileText size={22} />
          <span><strong>{moving.fields.title || moving.filename}</strong><small>{moving.fields.company || moving.filename} · 이동 중</small></span>
          <GripVertical size={16} />
        </div>, document.body,
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {dropTarget
          ? `${drafts.find((d) => d.id === dropTarget.id)?.fields.title || "리포트"} ${dropTarget.placement === "before" ? "앞" : "뒤"}에 놓기`
          : dragged ? "리포트 이동 중. Esc로 취소할 수 있습니다." : ""}
      </span>
      {!drafts.length && (
        <div className="table-empty" role="status">
          <FileText size={25} />
          <strong>{loading ? "리포트를 불러오는 중입니다." : "조건에 맞는 리포트가 없습니다."}</strong>
          <button
            className="text-button"
            onClick={() => update({ query: "", semester: "", author: "", industry: "", filter: "all" })}
          >
            필터 초기화
          </button>
        </div>
      )}
      <footer className="list-footer">
        <span>{drafts.length}개 리포트</span>
        <nav className="pagination" aria-label="리포트 목록 페이지">
          <button
            disabled={current === 1 || loading}
            onClick={() => {
              setPage(current - 1)
              setSelected([])
            }}
          >
            이전
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            disabled={current === pages || loading}
            onClick={() => {
              setPage(current + 1)
              setSelected([])
            }}
          >
            다음
          </button>
        </nav>
      </footer>
    </section>
  )
}
