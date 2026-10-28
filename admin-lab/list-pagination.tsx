import { ChevronDown } from "lucide-react"

export function ListPagination({page, pages, disabled, onPage}: {
  page:number; pages:number; disabled:boolean; onPage:(page:number)=>void
}) {
  return <nav className="cms-pagination" aria-label="목록 페이지 이동">
    <button disabled={disabled || page <= 1} onClick={()=>onPage(page-1)}>이전</button>
    <label className="cms-page-select">
      <span className="sr-only">이동할 페이지</span>
      <select aria-label="이동할 페이지" value={page} disabled={disabled} onChange={e=>onPage(Number(e.target.value))}>
        {Array.from({length:pages},(_,i)=><option key={i+1} value={i+1}>{i+1} / {pages} 페이지</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
    <button disabled={disabled || page >= pages} onClick={()=>onPage(page+1)}>다음</button>
  </nav>
}
