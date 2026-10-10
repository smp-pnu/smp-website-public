import type { ReactNode } from "react"

/** The notice layout used before the sitewide visual refresh. */
export function NoticeListing({ children }: { children: ReactNode }) {
  return <main className="notice-content relative z-10 mx-auto min-h-[75svh] max-w-7xl px-6 py-12 sm:py-16">
    <header className="text-center">
      <p className="text-[11px] tracking-[0.3em] text-sky-200/80">SMP NOTICE</p>
      <h1 className="mt-4 text-4xl font-light tracking-wide text-white sm:text-5xl">NOTICE</h1>
      <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">SMP의 새로운 소식을 확인하세요.</p>
    </header>
    {children}
  </main>
}
