import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export function ComingSoon({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <>
      <SiteHeader />
      <main className="relative z-10 flex min-h-[70vh] flex-col items-center justify-center px-6 py-32 text-center">
        <span className="text-xs font-normal tracking-[0.3em] text-sky-300">{eyebrow}</span>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-normal tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">
          현재 페이지를 준비하고 있습니다.
          <br />
          곧 더 나은 모습으로 찾아오겠습니다.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}

