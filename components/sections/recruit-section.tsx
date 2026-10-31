import Link from "next/link"
import { HomeEntrance } from "@/components/home-motion"
import { ArrowRight } from "lucide-react"

export function RecruitSection() {
  return (
    <HomeEntrance className="home-recruit__entrance">
    <section className="home-recruit px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <span className="text-xs font-normal tracking-[0.3em] text-site-accent">RECRUIT</span>
        <div className="home-recruit__display" aria-hidden="true">YOUR NEXT<br /><span>CHAPTER.</span></div>
        <h2 className="mt-4 text-2xl font-medium leading-snug text-white sm:text-3xl">
          SMP의 미래를 이끌어갈 가치투자의 리더를 찾습니다.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-site-body sm:text-lg">
          분석하고, 발표하고, 토론하고, 투자하며 SMP에서 자신만의 투자 논리를 만들어보세요.
        </p>

        <Link
          href="/recruit"
          className="mt-8 home-editorial-link inline-flex min-h-11 items-center gap-4 text-sm font-normal text-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          모집 안내 살펴보기
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
    </HomeEntrance>
  )
}

