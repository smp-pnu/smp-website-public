import type { InputHTMLAttributes } from "react"
import { ArrowRight, Search } from "lucide-react"

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  isPending?: boolean
}

/** Shared visual treatment for the header search and full results page. */
export function SearchField({ id, label, isPending = false, ...inputProps }: SearchFieldProps) {
  return <div className="flex items-center gap-3 rounded-[2px] border border-white/20 bg-white/[0.03] p-2 pl-4 transition-colors focus-within:border-sky-200/60 sm:gap-4 sm:pl-5">
    <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-sky-200/70" strokeWidth={1.5} />
    <label htmlFor={id} className="sr-only">{label}</label>
    <input {...inputProps} id={id} type="search"
      className="min-w-0 flex-1 appearance-none bg-transparent py-3 text-base font-light text-white outline-none placeholder:text-slate-400 sm:text-lg" />
    <button type="submit" disabled={isPending}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-[2px] border border-white/20 px-4 text-sm text-white transition-colors hover:border-sky-200/50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-wait disabled:text-slate-400 sm:px-5">
      {isPending ? "검색 중…" : "검색"}
      <ArrowRight aria-hidden="true" className="hidden h-4 w-4 sm:block" strokeWidth={1.5} />
    </button>
  </div>
}
