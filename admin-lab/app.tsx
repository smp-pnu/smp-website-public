import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, Plus, Upload, X } from "lucide-react"
import { DraftEditor } from "./editor"
import { AdminFrame } from "./admin-frame"
import { ReportList, type Filter, type Sort } from "./report-list"
import { samplePdf } from "./sample"
import { useLab } from "./use-lab"
import { useConfirmation } from "./confirm"

export function App({ username: _username, onLogout, onSecurity }: { username?: string; onLogout?: () => Promise<void>; onSecurity?: () => void }) {
  const lab = useLab(), confirm = useConfirmation()
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("updated")
  const [query, setQuery] = useState("")
  const [dirty, setDirty] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const dragDepth = useRef(0)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
    content.current?.querySelector<HTMLHeadingElement>("h1")?.focus({ preventScroll: true })
  }, [lab.selected])
  const busy = !!lab.progress || lab.loading
  const stored = lab.drafts.reduce((sum, draft) => sum + draft.storedBytes, 0)
  const selected = lab.drafts.find(draft => draft.id === lab.selected)
  const canLeave = async () => !dirty || await confirm("저장하지 않은 변경을 버리고 이동할까요?")
  const changeSelection = async (id: string | null) => { if (id === lab.selected || await canLeave()) lab.setSelected(id) }
  const ingest = async (files: File[]) => {
    if (!files.length || !await canLeave()) return
    setFilter("all"); setQuery(""); void lab.ingest(files)
  }
  const filtered = lab.drafts.filter(draft => {
    if (filter === "trash" ? !draft.trashedAt : draft.trashedAt) return false
    if (filter === "review" && draft.approvedRevision === draft.revision) return false
    if (filter === "approved" && draft.approvedRevision !== draft.revision) return false
    return `${draft.fields.title} ${draft.fields.company} ${draft.fields.ticker}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  }).sort((a, b) => sort === "company" ? a.fields.company.localeCompare(b.fields.company, "ko") : sort === "date" ? b.fields.date.localeCompare(a.fields.date) : b.updatedAt.localeCompare(a.updatedAt))
  return <AdminFrame active="reports" stored={stored} count={lab.drafts.length} busy={busy} onReports={() => void changeSelection(null)}
    onSecurity={onSecurity ? () => { void (async () => { if (await canLeave()) onSecurity() })() } : undefined}
    onLogout={onLogout ? async () => { if (!await canLeave()) return; try { await onLogout() } catch (e) { setRefreshError((e as Error).message) } } : undefined}>
    <div ref={content} className={dragging ? "content-area drag-active" : "content-area"}
      onDragEnter={e => { if (!busy && e.dataTransfer.types.includes("Files")) { e.preventDefault(); dragDepth.current++; setDragging(true) } }}
      onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault() }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }}
      onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); if (!busy) void ingest(Array.from(e.dataTransfer.files)) }}>
      {selected ? <div className="detail-navigation"><button className="text-button" disabled={busy} onClick={() => void changeSelection(null)}><ArrowLeft size={16}/>리포트 목록</button><span>{selected.fields.company || "리포트"}</span></div> : <header className="page-heading"><div><h1 tabIndex={-1}>리포트</h1><p>PDF를 등록하고 게시할 내용을 검토합니다.</p></div>
        <label className={`primary file-picker ${busy ? "disabled" : ""}`}><Plus size={17}/>PDF 추가<input type="file" aria-label="리포트 PDF 선택" accept=".pdf,application/pdf" multiple disabled={busy} onChange={e => { void ingest(Array.from(e.target.files ?? [])); e.target.value = "" }}/></label>
      </header>}
      {dragging && <div className="drop-hint"><Upload size={18}/>PDF를 놓으면 등록합니다.</div>}
      {lab.progress && <div className="upload-progress" role="status"><span className="progress-indicator"/><span>{lab.progress}</span><button className="text-button" onClick={lab.cancel}><X size={15}/>취소</button></div>}
      {lab.message && <div className="success-panel" role="status"><Check size={16}/>{lab.message}</div>}
      {lab.errors.length > 0 && <div className="error-panel" role="alert">{lab.errors.map((error, i) => <p key={i}>{error}</p>)}</div>}
      {refreshError && <p className="error-panel" role="alert">{refreshError}</p>}
      {selected ? <DraftEditor key={`${selected.id}:${selected.revision}:${selected.approvedAt}`} draft={selected} locked={busy} onDirty={setDirty} onSave={lab.save} onApprove={lab.approve} onTrash={lab.trash} onRemove={lab.remove} onReanalyze={lab.reanalyze}/> : <>
        <ReportList drafts={filtered} allDrafts={lab.drafts} loading={lab.loading} query={query} filter={filter} sort={sort} onQuery={setQuery} onFilter={setFilter} onSort={setSort} onSelect={id => void changeSelection(id)} onRefresh={() => { setRefreshError(""); void lab.refresh().catch(e => setRefreshError(e.message)) }}/>
        <div className="list-help"><span>PDF를 이 화면에 끌어놓아도 등록할 수 있습니다. 한 번에 최대 5개.</span><details><summary>시험 도구</summary><button className="secondary" disabled={busy} onClick={() => void ingest([samplePdf(0), samplePdf(1)])}>예시 PDF 2개 추가</button></details></div>
      </>}
    </div>
  </AdminFrame>
}
