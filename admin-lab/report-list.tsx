import { FileText, Search, RefreshCw, ChevronRight } from "lucide-react"
import type { Draft } from "./model"
import { statusOf } from "./model"
import { useCover } from "./use-lab"

export type Filter = "all" | "review" | "approved" | "trash"
export type Sort = "updated" | "date" | "company"
type Props = {
  drafts: Draft[]; allDrafts: Draft[]; loading: boolean; query: string; filter: Filter; sort: Sort;
  onQuery: (query: string) => void; onFilter: (filter: Filter) => void; onSort: (sort: Sort) => void;
  onSelect: (id: string) => void; onRefresh: () => void;
}
function Cover({ id }: { id: string }) {
  const cover = useCover(id)
  return <span className="report-thumb">{cover ? <img src={cover} alt="" loading="lazy"/> : <FileText size={17}/>}</span>
}
export function ReportList({ drafts, allDrafts, loading, query, filter, sort, onQuery, onFilter, onSort, onSelect, onRefresh }: Props) {
  const active = allDrafts.filter(d => !d.trashedAt)
  const approved = active.filter(d => d.approvedRevision === d.revision).length
  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "전체", count: active.length },
    { value: "review", label: "검토 대기", count: active.length - approved },
    { value: "approved", label: "시험 승인", count: approved },
    { value: "trash", label: "휴지통", count: allDrafts.length - active.length },
  ]
  return <section className="report-library" aria-label="리포트 목록">
    <nav className="list-tabs" aria-label="리포트 상태">{tabs.map(tab => <button key={tab.value} aria-pressed={filter === tab.value} onClick={() => onFilter(tab.value)}>{tab.label}<span>{tab.count}</span></button>)}</nav>
    <div className="list-toolbar">
      <label className="search-field"><Search size={16}/><input value={query} onChange={e => onQuery(e.target.value)} placeholder="제목, 기업명, 종목코드 검색" aria-label="리포트 검색"/>{query && <button className="clear-search" onClick={() => onQuery("")} aria-label="검색어 지우기">×</button>}</label>
      <label className="sort-field"><span className="sr-only">정렬 기준</span><select value={sort} onChange={e => onSort(e.target.value as Sort)}><option value="updated">최근 수정순</option><option value="date">발표일순</option><option value="company">기업명순</option></select></label>
      <button className="icon-button" aria-label="목록 새로고침" disabled={loading} onClick={onRefresh}><RefreshCw size={16}/></button>
    </div>
    <div className="report-table-wrap"><table className="report-table">
      <thead><tr><th scope="col">리포트</th><th scope="col">상태</th><th scope="col" className="medium-column">학기</th><th scope="col" className="medium-column">발표일</th><th scope="col" className="wide-column">작성자</th><th scope="col" className="row-arrow"><span className="sr-only">열기</span></th></tr></thead>
      <tbody>{drafts.map(draft => <tr key={draft.id}>
        <td><button className="report-link" onClick={() => onSelect(draft.id)}><Cover id={draft.id}/><span><strong>{draft.fields.title || draft.filename}</strong><small>{draft.fields.company || "기업 미입력"}{draft.fields.ticker ? ` · ${draft.fields.ticker}` : ""} · {draft.pages}쪽</small></span></button></td>
        <td><span className={`status ${draft.trashedAt ? "trashed" : draft.approvedRevision === draft.revision ? "approved" : "review"}`}>{statusOf(draft)}</span></td>
        <td className="medium-column">{draft.fields.semester || "—"}</td><td className="medium-column tabular">{draft.fields.date || "—"}</td><td className="wide-column">{draft.fields.author || "—"}</td>
        <td className="row-arrow"><ChevronRight size={16} aria-hidden="true"/></td>
      </tr>)}</tbody>
    </table></div>
    {!drafts.length && <div className="table-empty" role="status"><FileText size={25}/><strong>{loading ? "리포트를 불러오는 중입니다." : query ? "검색 결과가 없습니다." : filter === "all" ? "등록된 리포트가 없습니다." : "해당 상태의 리포트가 없습니다."}</strong><p>{!loading && (query ? "검색어를 바꾸거나 검색을 초기화하세요." : filter === "all" ? "오른쪽 위 ‘PDF 추가’에서 파일을 등록하세요." : "다른 상태를 선택해 확인하세요.")}</p></div>}
    <footer className="list-footer"><span>{drafts.length}개 리포트</span><span>파일당 32MB · 최대 120쪽</span></footer>
  </section>
}
