import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { siteSearchMatches, type SiteSearchEntry } from "@/lib/site-search-query"
export function SiteSearchResults({query, index}: {query: string; index: {entries: SiteSearchEntry[]; partial: boolean}}) {
  const results = siteSearchMatches(index.entries, query)
  return <>
    <p className="mt-8 break-words text-sm leading-6 text-slate-300">{`“${query}” 검색 결과 ${results.length}건`}</p>
    {index.partial && <p role="status" className="mt-3 text-sm text-slate-300">검색 결과 일부를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>}
    {!results.length ? <div className="mt-5 border-y border-white/15 bg-[#050c18]/60 px-6 py-14 text-center">
      <p className="text-base text-white">일치하는 검색 결과가 없습니다.</p>
      <p className="mt-2 text-sm leading-7 text-slate-400">철자를 확인하거나 더 짧은 검색어로 다시 검색해보세요.</p>
    </div> : <ul className="mt-5 divide-y divide-white/10 border-y border-white/15 bg-[#050c18]/60">
      {results.map((item, index) => <li key={`${item.href}-${index}`}>
        <Link prefetch={false} href={item.href} className="group flex items-start gap-4 px-5 py-6 transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-300 sm:gap-6 sm:px-7 sm:py-7">
          <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-6">
            <span className="inline-block min-w-12 shrink-0 rounded-[2px] border border-sky-200/15 bg-sky-200/[0.04] px-2 py-1 text-center text-[11px] leading-4 text-sky-200/80 sm:mt-0.5">{item.label}</span>
            <div className="mt-3 min-w-0 sm:mt-0">
              <h2 className="break-words text-base font-normal leading-7 text-white transition-colors group-hover:text-sky-200 sm:text-lg">{item.title}</h2>
              <p className="mt-2 line-clamp-2 break-words text-xs leading-6 text-slate-400 sm:text-sm">{item.text}</p>
            </div>
          </div>
          <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-sky-200" strokeWidth={1.5} />
        </Link>
      </li>)}
    </ul>}
  </>
}
