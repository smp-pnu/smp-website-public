"use client"

import {useEffect,useState} from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { RecruitSteps } from "@/components/recruit-steps"

import recruitmentData from "@/data/recruitment.json"
import { defaultRecruitment, recruitmentState, type Recruitment } from "@/lib/recruitment"

const recruitment:Recruitment = { ...defaultRecruitment, ...recruitmentData }
const eligibility = [
  ["모집 기수", `${recruitment.generation}기`], ["모집 대상", recruitment.audience],
  ["활동 요건", recruitment.requirement], ["모집 인원", recruitment.capacity],
]
const activity = [
  ["활동 일정", recruitment.schedule], ["활동 장소", recruitment.location],
  ["활동 기간", recruitment.requirement], ["회비 및 투자금", recruitment.fees],
]
const steps = ["서류 제출", "서류 합격자 발표", "면접", "최종 합격자 발표"]

function DetailRows({ items }: { items: string[][] }) {
  return <dl className="recruit-facts">
    {items.map(([label, value]) => <div key={label}>
      <dt className="text-sm leading-7 text-site-muted">{label}</dt>
      <dd className="whitespace-pre-line text-[15px] leading-7 text-site-body">{value}</dd>
    </div>)}
  </dl>
}

export function RecruitPageContent() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (recruitment.status !== "open") return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const state = recruitmentState(recruitment, now)
  const statusCopy = {
    upcoming: { label: "모집 예정", text: "새로운 시각으로 기업을 읽고, 함께 투자 원칙을 만들어 갈 학회원을 기다립니다." },
    open: { label: "모집 중", text: `SMP ${recruitment.generation}기 신입 학회원을 모집합니다. 아래 모집 요강과 일정을 확인한 뒤 지원해주세요.` },
    closed: { label: "모집 마감", text: "이번 모집이 마감되었습니다. 관심을 보내주신 모든 분께 감사드립니다." },
  }[state]
  const canApply = state === "open" && recruitment.scheduleConfirmed && !!recruitment.applicationUrl

  return <>
    <SiteHeader />
    <main className="site-page max-w-6xl">
      <PageIntro eyebrow="JOIN SMP" title="RECRUIT">부산대 투자 동아리 SMP에서 기업을 깊이 읽고, 함께 성장하는 투자 공부.</PageIntro>
      <nav aria-label="지원 전 학회 알아보기" className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-site-body">
        {[["/about", "SMP 학회 소개"], ["/curriculum", "금융투자 교육 과정"], ["/research", "기업·산업 분석 리포트"]].map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:text-white hover:underline">{label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>)}
      </nav>
      <article aria-labelledby="recruit-notice-title" className="recruit-guide mt-9 sm:mt-12">
        <header className="recruit-opening">
          <div>
            <p className="editorial-eyebrow">NEXT CHAPTER · SMP {recruitment.generation}</p>
            <h2 id="recruit-notice-title" className="mt-4 text-[clamp(1.75rem,3vw,2.5rem)] font-light leading-snug tracking-tight text-white">{recruitment.generation}기 신입회원 모집</h2>
            <p className="mt-4 max-w-md text-[15px] leading-8 text-site-body">{statusCopy.text}</p>
          </div>
          <div aria-label="모집 일정" className="recruit-schedule">
            <span className="inline-flex items-center gap-2 text-xs text-site-accent"><span className="h-1.5 w-1.5 rounded-full bg-sky-200" aria-hidden="true" />{statusCopy.label}</span>
            <p className="mt-3 text-[clamp(1.75rem,3vw,2.25rem)] font-light tracking-tight text-white">{recruitment.period}</p>
            <p className="mt-2 text-xs leading-6 text-site-muted">{recruitment.scheduleConfirmed ? "확정된 모집 일정입니다." : "세부 일정 추후 안내"}</p>
          </div>
        </header>
        <div className="recruit-columns">
          <section aria-labelledby="recruit-eligibility" className="recruit-section">
            <h3 id="recruit-eligibility" className="recruit-section-title"><span aria-hidden="true">01</span>지원 자격</h3>
            <DetailRows items={eligibility} />
          </section>
          <section aria-labelledby="recruit-activity" className="recruit-section">
            <h3 id="recruit-activity" className="recruit-section-title"><span aria-hidden="true">02</span>활동 안내</h3>
            <DetailRows items={activity} />
          </section>
        </div>
        <section aria-labelledby="selection-process" className="recruit-section recruit-process">
          <h3 id="selection-process" className="recruit-section-title"><span aria-hidden="true">03</span>전형 절차</h3>
          <div><RecruitSteps steps={steps} />
            <p className="mt-6 text-sm leading-7 text-site-muted">{recruitment.process}</p>
          </div>
        </section>
        <footer className="recruit-footer flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <p id="application-note" className="text-sm leading-7 text-site-body">{canApply ? "모집 요강을 확인한 뒤 공식 지원서를 작성해주세요." : state === "closed" ? "이번 모집의 지원 접수가 종료되었습니다." : "일정과 공식 지원 링크가 확정되면 접수를 시작합니다."}</p>
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/contact" className="editorial-link inline-flex min-h-11 items-center gap-2 text-sm font-medium">모집 문의<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            {canApply ? <a href={recruitment.applicationUrl!} onClick={event => { if(recruitmentState(recruitment) !== "open") { event.preventDefault(); setNow(Date.now()) } }} target="_blank" rel="noopener noreferrer" className="recruit-apply inline-flex min-h-11 items-center justify-between gap-6 rounded px-4 text-sm font-medium">지원서 작성<ArrowRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only"> (새 창)</span></a>
              : <button disabled aria-describedby="application-note" className="recruit-apply inline-flex min-h-11 cursor-not-allowed items-center justify-between gap-6 rounded px-4 text-sm font-medium">지원서 작성<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
        </footer>
      </article>
    </main>
    <SiteFooter />
  </>
}
