import { cloudMode, serverMode } from "./mode"
import { useState } from "react"
import { ArrowUpRight, CheckCheck, FileText, FlaskConical, FolderOpen, HardDrive, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload } from "lucide-react"
import { DraftEditor } from "./editor"
import { limits, sizeLabel, statusOf, type Draft } from "./model"
import { samplePdf } from "./sample"
import { useLab, useCover } from "./use-lab"
import { useConfirmation } from "./confirm"

type Filter = "all" | "review" | "approved" | "trash"
function DraftRow({ draft, selected, onSelect }: { draft: Draft; selected: boolean; onSelect: () => void }) {
  const cover = useCover(draft.id)
  return <button className={`draft-row ${selected ? "selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
    <span className="row-cover">{cover ? <img src={cover} alt="" loading="lazy"/> : <FileText size={20}/>}</span>
    <span className="row-copy"><span className="row-title">{draft.fields.title}</span><span className="row-sub">{draft.fields.company || "기업 확인 필요"} · {draft.pages}쪽</span><span className={`status ${statusOf(draft) === "시험 승인" ? "approved" : ""}`}>{statusOf(draft)}</span></span>
  </button>
}

export function App({ username, onLogout, onSecurity }: { username?: string; onLogout?: () => Promise<void>; onSecurity?: () => void }) {
  const lab = useLab()
  const confirm = useConfirmation()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [dirty, setDirty] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const busy = !!lab.progress || lab.loading
  const active = lab.drafts.filter(draft => !draft.trashedAt)
  const approved = active.filter(draft => draft.approvedRevision === draft.revision).length
  const stored = lab.drafts.reduce((sum, draft) => sum + draft.storedBytes, 0)
  const selected = lab.drafts.find(draft => draft.id === lab.selected)
  const changeSelection = async (id: string | null) => {
    if (dirty && id !== lab.selected && !await confirm("저장하지 않은 변경을 버리고 이동할까요?")) return false
    lab.setSelected(id); return true
  }
  const ingest = async (files: File[]) => {
    if (dirty && !await confirm("저장하지 않은 변경을 버리고 PDF를 추가할까요?")) return
    setFilter("all"); setQuery(""); void lab.ingest(files)
  }
  const filtered = lab.drafts.filter(draft => {
    if (filter === "trash" ? !draft.trashedAt : draft.trashedAt) return false
    if (filter === "review" && draft.approvedRevision === draft.revision) return false
    if (filter === "approved" && draft.approvedRevision !== draft.revision) return false
    return `${draft.fields.title} ${draft.fields.company} ${draft.fields.ticker}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  })
  const menus = [
    { id: "all" as const, text: "전체 리포트", Icon: FolderOpen, count: active.length },
    { id: "review" as const, text: "검토 대기", Icon: FileText, count: active.length - approved },
    { id: "approved" as const, text: "시험 승인", Icon: CheckCheck, count: approved },
    { id: "trash" as const, text: "휴지통", Icon: Trash2, count: lab.drafts.length - active.length },
  ]
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span>SMP</span><small>RESEARCH DESK</small></div>
      <div className="workspace"><span className="workspace-dot"/> PDF 관리자 <small>시험 공간</small></div>
      <nav aria-label="리포트 상태">{menus.map(({ id, text, Icon, count }) => <button key={id} className={filter === id ? "active" : ""} aria-current={filter === id ? "page" : undefined} onClick={async () => { if (await changeSelection(null)) setFilter(id) }}><Icon size={17}/>{text}<span>{count}</span></button>)}</nav>
      <div className="storage-card"><HardDrive size={17}/><strong>{serverMode ? "서버 저장 공간" : "브라우저 저장 공간"}</strong><p>{sizeLabel(stored)} <span>/ {sizeLabel(limits.totalBytes)}</span></p><progress value={stored} max={limits.totalBytes} aria-label="시험 자료 저장 용량"/><small>휴지통의 파일도 포함됩니다.</small></div>
      <div className="sidebar-foot"><ShieldCheck size={17}/><p>운영 환경과 분리됨<br/><small>Notion · Drive 연결 없음</small></p></div>
    </aside>
    <main>
      <div className="lab-banner"><FlaskConical size={16}/><strong>{cloudMode ? "온라인 관리자 시험판" : serverMode ? "로그인·서버 저장 시험판" : "로컬 시험판"}</strong><span>{cloudMode ? "자료는 별도 시험 저장소에 보관됩니다. 운영 사이트에는 게시되지 않습니다." : serverMode ? "자료는 이 Mac의 시험 서버에 저장됩니다. 운영 게시 연결은 없습니다." : "파일은 이 브라우저에만 저장됩니다. 실제 로그인·게시 기능은 연결되지 않았습니다."}</span>{onSecurity && <button className="secondary" disabled={busy} onClick={async () => { if (dirty && !await confirm("저장하지 않은 변경을 버리고 로그인 기기 관리로 이동할까요?")) return; onSecurity() }}>로그인 기기 관리</button>}{onLogout && <button className="secondary session-button" disabled={busy} onClick={async () => { if (dirty && !await confirm("저장하지 않은 변경을 버리고 로그아웃할까요?")) return; try { await onLogout() } catch (error) { setRefreshError((error as Error).message) } }}>{username} · 로그아웃</button>}</div>
      <header className="page-heading"><div><p className="eyebrow">CONTENT WORKSPACE</p><h1>리포트 관리<span>.</span></h1><p>PDF를 올리고, 내용을 확인하고, 게시할 준비를 마치세요.</p></div><div className="header-actions"><button className="secondary" disabled={busy} onClick={() => ingest([samplePdf(0), samplePdf(1)])}>예시 PDF 2개로 테스트 <ArrowUpRight size={15}/></button></div></header>
      <section className={`upload-zone ${dragging ? "dragging" : ""} ${busy ? "is-busy" : ""}`} aria-label="PDF 추가"
        onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) ingest(Array.from(e.dataTransfer.files)) }}>
        <div className="upload-symbol"><Upload size={24}/></div><div className="upload-copy"><h2>{lab.progress ? "PDF를 준비하고 있어요" : "리포트 PDF를 여기에 놓으세요"}</h2><p>{lab.progress || "한 번에 5개 · 파일당 32 MB · 120페이지까지"}</p></div>
        {lab.progress ? <button className="secondary" onClick={lab.cancel}>준비 취소</button> : <label className={`primary file-picker ${busy ? "disabled" : ""}`}><Plus size={17}/> PDF 선택<input type="file" aria-label="리포트 PDF 선택" accept=".pdf,application/pdf" multiple disabled={busy} onChange={e => { ingest(Array.from(e.target.files ?? [])); e.target.value = "" }}/></label>}
      </section>
      {lab.message && <div className="success-panel" role="status"><CheckCheck size={17}/>{lab.message}</div>}
      {lab.errors.length > 0 && <div className="error-panel" role="alert">{lab.errors.map((error, i) => <p key={i}>{error}</p>)}</div>}
      {refreshError && <p className="error-panel" role="alert">{refreshError}</p>}
      <div className="workspace-grid">
        <section className="library" aria-label="시험 리포트 목록">
          <div className="library-heading"><h2>{menus.find(menu => menu.id === filter)?.text} <span>{filtered.length}</span></h2><button className="icon-button" aria-label="목록 새로고침" onClick={async () => { if (await changeSelection(null)) { setRefreshError(""); void lab.refresh().catch(error => setRefreshError(error.message)) } }}><RefreshCw size={15}/></button></div>
          <label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 기업명, 종목코드" aria-label="리포트 검색"/></label>
          <div className="draft-list">{lab.loading ? <p className="list-empty">저장된 초안을 확인하는 중…</p> : filtered.length ? filtered.map(draft => <DraftRow key={draft.id} draft={draft} selected={lab.selected === draft.id} onSelect={() => changeSelection(draft.id)}/>) : <div className="list-empty"><FileText size={28}/><p>{query ? "일치하는 리포트가 없어요." : "아직 리포트가 없어요."}</p><small>{filter === "all" ? "위에서 PDF를 추가해 주세요." : "다른 상태의 목록을 확인해 주세요."}</small></div>}</div>
        </section>
        {selected ? <DraftEditor key={`${selected.id}:${selected.revision}:${selected.approvedAt}`} draft={selected} locked={busy} onDirty={setDirty} onSave={lab.save} onApprove={lab.approve} onTrash={lab.trash} onRemove={lab.remove} onReanalyze={lab.reanalyze}/> : <section className="welcome">
          <div className="welcome-icon"><FileText size={32}/></div><p className="eyebrow">A SIMPLER PUBLISHING FLOW</p><h2>리포트 하나로,<br/>게시 준비까지.</h2><p>파일을 올리면 표지와 입력 후보를 준비합니다.<br/>관리자는 내용을 확인하는 데 집중하세요.</p>
          <ol><li><span>01</span><div><strong>PDF 추가</strong><p>표지 생성과 원문 분석</p></div></li><li><span>02</span><div><strong>내용 검토</strong><p>자동 입력 후보 확인과 수정</p></div></li><li><span>03</span><div><strong>시험 승인</strong><p>운영 게시 없이 흐름 확인</p></div></li></ol>
          <div className="local-note">{cloudMode ? "컴퓨터가 꺼져 있어도 접속할 수 있습니다. 무료 시험 한도: 50개·200MB, 하루 API 요청 5,000회." : serverMode ? "시험 자료는 서버 폴더에 보관됩니다. 서버 폴더 삭제 전에는 백업해 주세요." : "브라우저 데이터를 지우면 시험 자료도 사라집니다."}<br/>원본 파일은 따로 보관해 주세요.</div>
        </section>}
      </div>
      <footer className="page-foot">SMP · 부산대학교 금융투자학회 <span>{serverMode ? "PDF ADMIN · PRIVATE SERVER TRIAL" : "PDF ADMIN LAB · LOCAL ONLY"}</span></footer>
    </main>
  </div>
}
