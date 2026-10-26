import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, Plus, Upload, X } from "lucide-react"
import { DraftEditor } from "./editor"
import { AdminFrame } from "./admin-frame"
import { ReportList } from "./report-list"
import {
  defaultQuery,
  filterReports,
  moveReport,
  type LibraryQuery,
  type LibraryOrder,
  type BatchAction,
} from "./library-model"
import type { Draft } from "./model"
import { api } from "./server-storage"
import { samplePdf } from "./sample"
import { useLab } from "./use-lab"
import { useConfirmation } from "./confirm"
import { cloudMode } from "./mode"
import { Notices } from "./notices"

export function App({
  username: _username,
  onLogout,
  onSecurity,
}: {
  username?: string
  onLogout?: () => Promise<void>
  onSecurity?: () => void
}) {
  const lab = useLab(),
    confirm = useConfirmation()
  const [section, setSection] = useState<"reports" | "notices">("reports")
  const [noticeBusy, setNoticeBusy] = useState(false)
  const [overview, setOverview] = useState<{ bytes: number; reports: number; pending: number } | null>(null)
  const [overviewTick, setOverviewTick] = useState(0)
  const refreshOverview = useCallback(() => setOverviewTick((n) => n + 1), [])
  useEffect(() => {
    if (!cloudMode || lab.loading) return
    let active = true
    void api("/library/status")
      .then((r) => r.json())
      .then((v) => {
        if (active) setOverview(v)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [lab.drafts, lab.loading, overviewTick])
  const [criteria, setCriteria] = useState<LibraryQuery>({
    ...defaultQuery,
    sort: cloudMode ? "order" : "updated",
  })
  const [order, setOrder] = useState<LibraryOrder>({ revision: 1, ids: [] })
  const [operation, setOperation] = useState(false)
  const [orderLoading, setOrderLoading] = useState(cloudMode)
  const [dirty, setDirty] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const dragDepth = useRef(0)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
    content.current?.querySelector<HTMLHeadingElement>("h1")?.focus({ preventScroll: true })
  }, [lab.selected])
  const busy = !!lab.progress || lab.loading || operation || noticeBusy || orderLoading
  const stored = lab.drafts.reduce((sum, draft) => sum + draft.storedBytes, 0)
  const selected = lab.drafts.find((draft) => draft.id === lab.selected)
  const canLeave = async () => !dirty || (await confirm("저장하지 않은 변경을 버리고 이동할까요?"))
  const changeSelection = async (id: string | null) => {
    if (id === lab.selected || (await canLeave())) lab.setSelected(id)
  }
  const ingest = async (files: File[]) => {
    if (!files.length || !(await canLeave())) return
    setCriteria({ ...criteria, filter: "all", query: "" })
    void lab.ingest(files)
  }
  useEffect(() => {
    if (!cloudMode || lab.loading) return
    let active = true
    setOrderLoading(true)
    void api("/reports/order")
      .then((r) => r.json())
      .then((v) => {
        if (active) setOrder(v)
      })
      .catch((e) => {
        if (active) setRefreshError(e.message)
      }).finally(() => { if (active) setOrderLoading(false) })
    return () => {
      active = false
    }
  }, [lab.drafts, lab.loading])
  const filtered = filterReports(lab.drafts, criteria, order.ids)
  const move = async (from: string, to: string) => {
    if (busy || from === to) return
    setOperation(true)
    setRefreshError("")
    try {
      setOrder(
        await (
          await api("/reports/order", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision: order.revision, ids: moveReport(order.ids, from, to) }),
          })
        ).json(),
      )
    } catch (e) {
      setRefreshError((e as Error).message)
    } finally {
      setOperation(false)
    }
  }
  const batch = async (items: Draft[], action: BatchAction) => {
    if (
      busy ||
      !items.length ||
      !(await confirm(
        `${items.length}개 자료를 ${action.type === "remove" ? "PDF·표지와 함께 영구 삭제" : action.type === "trash" ? "휴지통으로 이동" : action.type === "restore" ? "복원" : "일괄 수정"}할까요?`,
      ))
    )
      return
    setOperation(true)
    setRefreshError("")
    try {
      await api("/reports/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(({ id, revision }) => ({ id, revision })), action }),
      })
      await lab.refresh()
    } catch (e) {
      setRefreshError((e as Error).message)
    } finally {
      setOperation(false)
    }
  }
  return (
    <AdminFrame
      active={section}
      stored={cloudMode ? overview?.bytes : stored}
      count={overview?.reports ?? lab.drafts.length}
      busy={busy}
      onReports={() => {
        void (async () => {
          if (await canLeave()) {
            setSection("reports")
            lab.setSelected(null)
          }
        })()
      }}
      onNotices={
        cloudMode
          ? () => {
              void (async () => {
                if (await canLeave()) {
                  setSection("notices")
                  lab.setSelected(null)
                }
              })()
            }
          : undefined
      }
      onSecurity={
        onSecurity
          ? () => {
              void (async () => {
                if (await canLeave()) onSecurity()
              })()
            }
          : undefined
      }
      onLogout={
        onLogout
          ? async () => {
              if (!(await canLeave())) return
              try {
                await onLogout()
              } catch (e) {
                setRefreshError((e as Error).message)
              }
            }
          : undefined
      }
    >
      {section === "notices" ? (
        <Notices onDirty={setDirty} onBusy={setNoticeBusy} onChange={refreshOverview} />
      ) : (
        <div
          ref={content}
          className={dragging ? "content-area drag-active" : "content-area"}
          onDragEnter={(e) => {
            if (!busy && e.dataTransfer.types.includes("Files")) {
              e.preventDefault()
              dragDepth.current++
              setDragging(true)
            }
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault()
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (!dragDepth.current) setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            dragDepth.current = 0
            setDragging(false)
            if (!busy) void ingest(Array.from(e.dataTransfer.files))
          }}
        >
          {selected ? (
            <div className="detail-navigation">
              <button className="text-button" disabled={busy} onClick={() => void changeSelection(null)}>
                <ArrowLeft size={16} />
                리포트 목록
              </button>
              <span>{selected.fields.company || "리포트"}</span>
            </div>
          ) : (
            <header className="page-heading">
              <div>
                <h1 tabIndex={-1}>리포트</h1>
                <p>PDF를 등록하고 게시할 내용을 검토합니다.</p>
              </div>
              <label className={`primary file-picker ${busy ? "disabled" : ""}`}>
                <Plus size={17} />
                PDF 추가
                <input
                  type="file"
                  aria-label="리포트 PDF 선택"
                  accept=".pdf,application/pdf"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    void ingest(Array.from(e.target.files ?? []))
                    e.target.value = ""
                  }}
                />
              </label>
            </header>
          )}
          {dragging && (
            <div className="drop-hint">
              <Upload size={18} />
              PDF를 놓으면 등록합니다.
            </div>
          )}
          {lab.progress && (
            <div className="upload-progress" role="status">
              <span className="progress-indicator" />
              <span>{lab.progress}</span>
              <button className="text-button" onClick={lab.cancel}>
                <X size={15} />
                취소
              </button>
            </div>
          )}
          {lab.message && (
            <div className="success-panel" role="status">
              <Check size={16} />
              {lab.message}
            </div>
          )}
          {lab.errors.length > 0 && (
            <div className="error-panel" role="alert">
              {lab.errors.map((error, i) => (
                <p key={i}>{error}</p>
              ))}
            </div>
          )}
          {refreshError && (
            <p className="error-panel" role="alert">
              {refreshError}
            </p>
          )}
          {selected ? (
            <DraftEditor
              key={`${selected.id}:${selected.revision}:${selected.approvedAt}`}
              draft={selected}
              locked={busy}
              onDirty={setDirty}
              onSave={lab.save}
              onApprove={lab.approve}
              onTrash={lab.trash}
              onRemove={lab.remove}
              onReanalyze={lab.reanalyze}
              onReplace={lab.replace}
            />
          ) : (
            <>
              <ReportList
                drafts={filtered}
                allDrafts={lab.drafts}
                loading={busy}
                criteria={criteria}
                managed={cloudMode}
                onCriteria={setCriteria}
                onMove={move}
                onBatch={batch}
                onSelect={(id) => void changeSelection(id)}
                onRefresh={() => {
                  setRefreshError("")
                  void lab.refresh().catch((e) => setRefreshError(e.message))
                }}
              />
              <div className="list-help">
                <span>PDF를 이 화면에 끌어놓아도 등록할 수 있습니다. 한 번에 최대 5개.</span>
                <details>
                  <summary>시험 도구</summary>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void ingest([samplePdf(0), samplePdf(1)])}
                  >
                    예시 PDF 2개 추가
                  </button>
                </details>
              </div>
              {cloudMode && (
                <p className="list-help">
                  등록 시 앞 3쪽의 텍스트를 Cloudflare AI에 전달해 입력 후보를 보완합니다. 하루 최대 10건이며,
                  같은 원문 결과는 재사용합니다. 자동 입력값은 원문과 확인해 주세요.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </AdminFrame>
  )
}
