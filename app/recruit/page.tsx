import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { RecruitSteps } from "@/components/recruit-steps"

export const metadata: Metadata = { title: "RECRUIT | SMP" }

// Activate applications only after confirming both the schedule and the official form.
const recruitment: { status: "upcoming" | "open" | "closed"; scheduleConfirmed: boolean; applicationUrl: string | null; deadline: string } = {
  status: "upcoming",
  scheduleConfirmed: false,
  applicationUrl: null,
  deadline: "2027년 8월 15일",
}

const details = [
  ["모집 기수", "41기"],
  ["모집 대상", "전공 제한 없음 · 휴학 여부 무관"],
  ["지원 자격", "2학기 이상 활동할 수 있는 부산대학교 학생"],
  ["모집 인원", "추후 안내"],
  ["지원 기간", "2027.08.01 – 2027.08.15 (예정)"],
  ["활동 기간", "2027년 하반기 · 2028년 상반기 필수 활동"],
  ["활동 일정", "매주 화요일·금요일 18:30부터 · 부산대학교 강의실"],
  ["회비 및 투자금", "입회비 40,000원 · 월 회비 15,000원\n납부 방식: 계좌 이체\n투자금 및 반환 조건: 추후 안내"],
  ["결과 안내", "2027.08.28 (토) · 합격자에게 개별 연락 예정"],
  ["지원 방법", "SMP 41기 지원서 작성 · 공식 지원 링크 추후 안내"],
]
const steps = ["서류 제출", "서류 합격자 발표", "면접", "최종 합격자 발표"]

export default function RecruitPage() {
  const statusCopy = {
    upcoming: { label: "모집 예정", text: "다음 모집 안내를 준비하고 있습니다. 모집 일정이 확정되면 이 페이지에서 안내하겠습니다." },
    open: { label: "모집 중", text: `SMP 41기 신입 학회원을 모집합니다. ${recruitment.deadline}까지 지원서를 제출해주세요.` },
    closed: { label: "모집 마감", text: "이번 모집이 마감되었습니다. 관심을 보내주신 모든 분께 감사드립니다." },
  }[recruitment.status]
  const canApply = recruitment.status === "open" && recruitment.scheduleConfirmed && !!recruitment.applicationUrl

  return <>
    <SiteHeader />
    <main className="relative z-10">
      <div className="site-page max-w-5xl">
        <PageIntro eyebrow="RECRUITMENT · 41기" title="RECRUITMENT GUIDE">부산대 투자 동아리 SMP에서 기업을 분석하고, 가치투자를 함께 공부할 학회원을 기다립니다.</PageIntro>
        <nav aria-label="지원 전 학회 알아보기" className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-site-accent">
          <Link href="/about" className="underline-offset-4 hover:underline">학회 활동 소개 ↗</Link>
          <Link href="/curriculum" className="underline-offset-4 hover:underline">기업분석 커리큘럼 ↗</Link>
          <Link href="/research" className="underline-offset-4 hover:underline">학회원 리포트 읽기 ↗</Link>
        </nav>
        <article aria-labelledby="recruit-notice-title" className="paper-panel mt-10 overflow-hidden">
          <header className="border-t-4 border-t-sky-900 px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs font-medium tracking-[.16em] text-slate-500">SMP · RECRUITMENT NOTICE</p>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">{statusCopy.label}</span>
            </div>
            <h2 id="recruit-notice-title" className="mt-6 text-2xl font-semibold leading-snug tracking-tight text-slate-950 sm:text-3xl">41기 신입회원 모집 안내</h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{statusCopy.text}</p>
          </header>
          <div className="px-6 pb-8 sm:px-10 sm:pb-10">
            <section aria-labelledby="recruit-details">
              <h3 id="recruit-details" className="sr-only">모집 요강</h3>
              <dl className="divide-y divide-slate-200 border-y border-slate-300">
                {details.map(([label, value]) => <div key={label} className="grid gap-2 py-5 sm:grid-cols-[140px_1fr] sm:gap-8">
                  <dt className="text-sm font-semibold leading-8 text-slate-900">{label}</dt>
                  <dd className="whitespace-pre-line text-base leading-8 text-slate-700">{value}</dd>
                </div>)}
              </dl>
            </section>
            <section aria-labelledby="selection-process" className="mt-10">
              <h3 id="selection-process" className="text-lg font-semibold text-slate-900">전형 절차</h3>
              <RecruitSteps steps={steps} />
            </section>
            <div className="mt-10 border-t border-slate-200 pt-7">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                {canApply ? <a href={recruitment.applicationUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-3 rounded bg-sky-900 px-5 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-800">지원서 작성 <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                  : <button disabled aria-describedby="application-note" className="inline-flex min-h-11 cursor-not-allowed items-center gap-3 rounded bg-slate-100 px-5 text-sm font-medium text-slate-500">지원서 작성 <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
                <Link href="/contact" className="paper-link inline-flex min-h-11 items-center gap-2 text-sm font-medium">모집 문의 <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              {!canApply && <p id="application-note" className="mt-4 text-sm leading-7 text-slate-600">{recruitment.status === "closed" ? "이번 모집의 지원 접수가 종료되었습니다." : "모집 일정과 공식 지원 링크가 확정되면 지원할 수 있습니다."}</p>}
            </div>
          </div>
        </article>
      </div>
    </main>
    <SiteFooter />
  </>
}
