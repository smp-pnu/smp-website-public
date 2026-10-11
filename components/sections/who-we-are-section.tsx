import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function WhoWeAreSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl text-center">
        <div className="flex flex-col items-center gap-6 sm:gap-8">
          <div>
            <span className="text-xs font-normal tracking-[0.3em] text-site-accent">WHO WE ARE</span>
            <h2 className="mt-4 text-2xl font-medium leading-snug text-white sm:text-3xl">
              부산대학교 금융투자학회 SMP
            </h2>
          </div>
          <div className="flex max-w-4xl flex-col items-center">
            <p className="text-base leading-relaxed text-site-body sm:text-lg">
              이곳은 부산대학교 금융투자학회 SMP의 공식 홈페이지입니다. 2006년 시작된 SMP는 부산대에서 기업분석과 주식투자를 함께 공부하는 투자 동아리입니다.
              증권·산업 리서치를 바탕으로 기업의 내재가치와 성장 가능성을 분석하고, 발표와 토론을 통해 투자 아이디어를 발전시킵니다.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-flex items-center gap-2 text-sm font-normal text-site-accent transition-colors hover:text-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              SMP 학회 소개
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

