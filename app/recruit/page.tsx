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
        <PageIntro eyebrow="RECRUITMENT · 41기" title="RECRUITMENT GUIDE" />
        <section aria-label="모집 상태" className="mt-10 border-l-2 border-sky-300 pl-5">
          <h2 className="text-lg font-normal text-site-accent">{statusCopy.label}</h2>
          <p className="mt-3 max-w-2xl text-base leading-loose text-site-body">{statusCopy.text}</p>
        </section>
        <section aria-labelledby="recruit-details" className="mt-14">
          <h2 id="recruit-details" className="text-2xl font-light text-white">모집 안내</h2>
          <dl className="mt-6 divide-y divide-site-line border-y border-site-line">
            {details.map(([label, value]) => <div key={label} className="grid gap-3 py-5 sm:grid-cols-[160px_1fr] sm:gap-8">
              <dt className="text-sm text-site-accent">{label}</dt>
              <dd className="whitespace-pre-line text-base leading-loose text-site-body">{value}</dd>
            </div>)}
          </dl>
        </section>
        <section aria-labelledby="selection-process" className="mt-14">
          <h2 id="selection-process" className="text-2xl font-light text-white">전형 절차</h2>
          <RecruitSteps steps={steps} />
        </section>
        <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-5">
          {canApply ? <a href={recruitment.applicationUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-site-accent hover:text-site-accent">APPLY NOW <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
            : <button disabled aria-describedby="application-note" className="inline-flex cursor-not-allowed items-center gap-2 text-sm text-site-muted">APPLY NOW <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
          <Link href="/contact" className="inline-flex items-center gap-2 text-sm text-site-accent hover:text-site-accent">CONTACT US <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        {!canApply && <p id="application-note" className="mt-4 text-sm text-site-muted">{recruitment.status === "closed" ? "이번 모집의 지원 접수가 종료되었습니다." : "모집 일정과 공식 지원 링크가 확정되면 지원할 수 있습니다."}</p>}
      </div>
    </main>
    <SiteFooter />
  </>
}
