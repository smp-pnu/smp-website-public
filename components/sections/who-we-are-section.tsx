import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function WhoWeAreSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl text-center">
        <div className="flex flex-col items-center gap-6 sm:gap-8">
          <div>
            <span className="text-xs font-normal tracking-[0.3em] text-sky-300">WHO WE ARE</span>
            <h2 className="mt-4 text-2xl font-medium leading-snug text-white sm:text-3xl">
              부산대 유일의 금융투자학회 SMP
            </h2>
          </div>
          <div className="flex max-w-4xl flex-col items-center">
            <p className="text-base leading-relaxed text-slate-300 sm:text-lg">
              SMP는 가치투자를 기반으로 기업의 내재가치와 성장 가능성을 분석하는 부산대학교 금융투자학회입니다.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-flex items-center gap-2 text-sm font-normal text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              VIEW MORE
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

