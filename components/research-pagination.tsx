import Link from "next/link"

export function ResearchPagination({ page, totalPages, pageHref }: {
  page: number
  totalPages: number
  pageHref: (page: number) => string
}) {
  const firstPage = Math.floor((page - 1) / 10) * 10 + 1
  const pages = Array.from({ length: Math.min(10, totalPages - firstPage + 1) }, (_, index) => firstPage + index)
  const stepClass = "inline-flex h-11 items-center justify-center rounded-md px-3 text-sm transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"

  return <nav aria-label="목록 페이지" className="mt-10 flex flex-col items-center gap-4">
    <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-3">
      {page > 1
        ? <Link prefetch={false} href={pageHref(page - 1)} rel="prev" className={`order-2 text-slate-300 md:order-1 ${stepClass}`}>이전</Link>
        : <span aria-disabled="true" className="order-2 inline-flex h-11 items-center px-3 text-sm text-slate-600 md:order-1">이전</span>}
      <div className="order-1 flex w-full justify-center md:order-2 md:w-auto">
      <ol className="flex w-full max-w-[236px] flex-wrap justify-center gap-1 md:w-auto md:max-w-none">
        {pages.map(number => <li key={number}>
          <Link prefetch={false} href={pageHref(number)} aria-label={`${number}페이지`} aria-current={number === page ? "page" : undefined}
            className={`flex h-11 min-w-11 items-center justify-center rounded-md border text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${number === page ? "border-sky-300/50 bg-sky-300/15 font-semibold text-sky-200" : "border-transparent text-slate-400 hover:border-white/15 hover:bg-white/5 hover:text-white"}`}>
            {number}
          </Link>
        </li>)}
      </ol>
      </div>
      {page < totalPages
        ? <Link prefetch={false} href={pageHref(page + 1)} rel="next" className={`order-3 text-slate-300 ${stepClass}`}>다음</Link>
        : <span aria-disabled="true" className="order-3 inline-flex h-11 items-center px-3 text-sm text-slate-600">다음</span>}
    </div>
    <p className="text-xs tabular-nums text-slate-500">{page} / {totalPages} 페이지</p>
  </nav>
}
