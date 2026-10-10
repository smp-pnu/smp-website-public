import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function AlumniSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl text-center">
        <span className="text-xs font-normal tracking-[0.3em] text-site-accent">NETWORK</span>
        <h2 className="mt-4 text-2xl font-medium leading-snug text-white sm:text-3xl">
          세대를 잇는 네트워크, 함께 성장하는 SMP
        </h2>
        <p className="mt-6 text-base leading-relaxed text-site-body sm:text-lg">
          <span className="block">금융권을 비롯한 다양한 분야에서 활동하는 선배들과 경험과 지식을 나눕니다.</span>
          <span className="block">서울과 부산에서 진행하는 홈커밍데이를 통해 기수 간 교류를 이어갑니다.</span>
        </p>
        <Link
          href="/network"
          className="mt-8 inline-flex items-center gap-2 text-sm font-normal text-site-accent transition-colors hover:text-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          MEET OUR PEOPLE
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

