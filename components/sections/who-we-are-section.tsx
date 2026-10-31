import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SITE_INTRO, SITE_NAME_KO } from "@/lib/site-config"
import { HomePanorama } from "@/components/home-motion"

export function WhoWeAreSection() {
  return (
    <section id="home-about" className="home-about px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl text-center">
        <div className="flex flex-col items-center gap-6 sm:gap-8">
          <div>
            <span className="text-xs font-normal tracking-[0.3em] text-site-accent">WHO WE ARE</span>
            <h2 className="mt-4 text-2xl font-medium leading-snug text-white sm:text-3xl">
              <span className="home-about__headline">가능성을 읽는 시선,<br /><em>가치를 만드는 우리.</em></span>
              <span className="sr-only">{SITE_NAME_KO}</span>
            </h2>
          </div>
          <div className="flex max-w-4xl flex-col items-center">
            <p className="text-base leading-relaxed text-site-body sm:text-lg">
              {SITE_INTRO}{" "}
              투자 동아리 활동을 통해 기업의 내재가치와 성장 가능성을 분석하고, 팀 리포트 작성과 발표·토론으로 투자 아이디어를 발전시킵니다.
            </p>
            <Link
              href="/about"
              className="home-editorial-link mt-6 inline-flex min-h-11 items-center gap-4 text-sm font-normal text-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              부산대 SMP 활동 알아보기
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <HomePanorama />
      </div>
    </section>
  )
}

