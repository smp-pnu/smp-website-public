function pageNumbers(page: number, pages: number): (number | string)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, "end", pages]
  if (page >= pages - 3) return [1, "start", pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, "start", page - 1, page, page + 1, "end", pages]
}

export function ListPagination({page, pages, disabled, onPage}: {
  page:number; pages:number; disabled:boolean; onPage:(page:number)=>void
}) {
  return <nav className="cms-pagination" aria-label="목록 페이지 이동">
    <button disabled={disabled || page <= 1} onClick={()=>onPage(page-1)}>이전</button>
    {pageNumbers(page, pages).map(value => typeof value === "number" ?
      <button key={value} className="cms-page-number" aria-label={`${value}페이지`}
        aria-current={value === page ? "page" : undefined} disabled={disabled}
        onClick={() => { if (value !== page) onPage(value) }}>{value}</button>
      : <span key={value} className="cms-page-gap" aria-hidden="true">…</span>
    )}
    <span className="sr-only">전체 {pages}페이지</span>
    <button disabled={disabled || page >= pages} onClick={()=>onPage(page+1)}>다음</button>
  </nav>
}
