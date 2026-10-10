import type { InputHTMLAttributes } from "react"
import { ArrowRight, Search } from "lucide-react"

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  isPending?: boolean
}

/** The research toolbar's search control, shared across the site. */
export function SearchField({ id, label, isPending = false, ...inputProps }: SearchFieldProps) {
  return <div className="flex h-11 items-center rounded-[4px] border border-white/15 bg-white/[0.025] pl-3 transition-colors focus-within:border-sky-200/50 focus-within:bg-white/[0.04]">
    <Search aria-hidden="true" size={16} className="shrink-0 text-slate-400" strokeWidth={1.5} />
    <label htmlFor={id} className="sr-only">{label}</label>
    <input {...inputProps} id={id} type="search"
      className="min-w-0 flex-1 appearance-none bg-transparent px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-400 sm:text-sm" />
    <button type="submit" disabled={isPending} aria-label={isPending ? "검색 중…" : `${label} 실행`} title="검색"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-r-[4px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-200 disabled:cursor-wait">
      <ArrowRight aria-hidden="true" size={17} strokeWidth={1.5} />
    </button>
  </div>
}
