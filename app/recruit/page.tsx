import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { RecruitSteps } from "@/components/recruit-steps"

export const metadata: Metadata = { title: "RECRUIT | SMP" }

// Activate applications only after confirming both the schedule and the official form.
const recruitment: { status: "upcoming" | "open" | "closed"; scheduleConfirmed: boolean; applicationUrl: string | null; period: string } = {
  status: "upcoming",
  scheduleConfirmed: false,
  applicationUrl: null,
  period: "2027년 1~2월",
}

const eligibility = [
  ["모집 기수", "41기"],
  ["모집 대상", "부산대학교 학생 · 전공 제한 없음 · 휴학 여부 무관"],
  ["활동 요건", "2학기 이상 활동할 수 있는 분"],
  ["모집 인원", "추후 안내"],
]
const activity = [
  ["활동 일정", "매주 화요일·금요일 18:30부터"],
  ["활동 장소", "부산대학교 강의실"],
  ["활동 기간", "2학기 이상 · 세부 활동 기간 추후 안내"],
  ["회비 및 투자금", "입회비 40,000원 · 월 회비 15,000원\n납부 방식: 계좌 이체\n투자금 및 반환 조건: 추후 안내"],
]
const steps = ["서류 제출", "서류 합격자 발표", "면접", "최종 합격자 발표"]

function DetailRows({ items }: { items: string[][] }) {
  return <dl className="mt-5 divide-y divide-slate-200/80">
    {items.map(([label, value]) => <div key={label} className="grid gap-1.5 py-4 sm:grid-cols-[108px_1fr] sm:gap-6">
      <dt className="text-sm font-medium leading-7 text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{value}</dd>
    </div>)}
  </dl>
}

export default function RecruitPage() {
  const statusCopy = {
    upcoming: { label: "모집 예정", text: "새로운 시각으로 기업을 읽고, 함께 투자 원칙을 만들어 갈 학회원을 기다립니다." },
    open: { label: "모집 중", text: "SMP 41기 신입 학회원을 모집합니다. 아래 모집 요강과 일정을 확인한 뒤 지원해주세요." },
    closed: { label: "모집 마감", text: "이번 모집이 마감되었습니다. 관심을 보내주신 모든 분께 감사드립니다." },
  }[recruitment.status]
  const canApply = recruitment.status === "open" && recruitment.scheduleConfirmed && !!recruitment.applicationUrl

  return <>
    <SiteHeader />
    <main className="site-page max-w-6xl">
      <PageIntro eyebrow="JOIN SMP" title="RECRUIT">기업을 깊이 읽고, 함께 성장하는 투자 공부.</PageIntro>
      <nav aria-label="지원 전 학회 알아보기" className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-site-body">
        {[["/about", "학회 소개"], ["/curriculum", "커리큘럼"], ["/research", "학회원 리포트"]].map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:text-white hover:underline">{label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>)}
      </nav>
      <article aria-labelledby="recruit-notice-title" className="paper-panel recruit-sheet mt-9 overflow-clip sm:mt-12">
        <header className="border-b border-slate-200 px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-xs">
            <p className="tracking-[.2em] text-slate-500">SMP · 41ST RECRUITMENT</p>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-slate-700"><span className="h-1.5 w-1.5 rounded-full bg-sky-700" aria-hidden="true" />{statusCopy.label}</span>
          </div>
          <h2 id="recruit-notice-title" className="mt-5 text-2xl font-normal leading-snug tracking-tight text-slate-950 sm:text-3xl">41기 신입회원 모집 안내</h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600">{statusCopy.text}</p>
        </header>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <aside aria-label="모집 일정과 지원 안내" className="border-b border-slate-200 bg-[#f4f6f8] p-6 sm:p-10 lg:col-start-2 lg:row-start-1 lg:border-b-0 lg:border-l lg:px-7">
            <div className="lg:sticky lg:top-28">
              <p className="text-[11px] font-medium tracking-[.18em] text-slate-500">APPLICATION WINDOW</p>
              <p className="mt-4 text-2xl font-medium tracking-tight text-slate-950">{recruitment.period}</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">{recruitment.scheduleConfirmed ? "확정된 모집 일정입니다." : "모집 예정 · 세부 일정 추후 안내"}</p>
              <div className="mt-6 border-t border-slate-200 pt-6">
                {canApply ? <a href={recruitment.applicationUrl!} target="_blank" rel="noopener noreferrer" className="recruit-apply inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-[3px] bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">지원서 작성<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                  : <button disabled aria-describedby="application-note" className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-between gap-3 rounded-[3px] border border-slate-300 bg-white px-4 text-sm text-slate-500">지원서 작성<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
                {!canApply && <p id="application-note" className="mt-3 text-xs leading-6 text-slate-500">{recruitment.status === "closed" ? "이번 모집의 지원 접수가 종료되었습니다." : "일정과 공식 지원 링크가 확정되면 접수를 시작합니다."}</p>}
                <Link href="/contact" className="paper-link mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium">모집 문의<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
            </div>
          </aside>
          <div className="min-w-0 divide-y divide-slate-200 px-6 sm:px-10 lg:col-start-1 lg:row-start-1">
            <section aria-labelledby="recruit-eligibility" className="py-8 sm:py-10">
              <h3 id="recruit-eligibility" className="flex items-baseline gap-3 text-lg font-medium text-slate-950"><span className="text-xs font-normal tabular-nums text-slate-400" aria-hidden="true">01</span>지원 자격</h3>
              <DetailRows items={eligibility} />
            </section>
            <section aria-labelledby="recruit-activity" className="py-8 sm:py-10">
              <h3 id="recruit-activity" className="flex items-baseline gap-3 text-lg font-medium text-slate-950"><span className="text-xs font-normal tabular-nums text-slate-400" aria-hidden="true">02</span>활동 안내</h3>
              <DetailRows items={activity} />
            </section>
            <section aria-labelledby="selection-process" className="py-8 sm:py-10">
              <h3 id="selection-process" className="flex items-baseline gap-3 text-lg font-medium text-slate-950"><span className="text-xs font-normal tabular-nums text-slate-400" aria-hidden="true">03</span>전형 절차</h3>
              <RecruitSteps steps={steps} />
              <p className="mt-6 text-sm leading-7 text-slate-600">서류 접수와 면접, 결과 발표 일정은 모집 공고 확정 후 안내합니다. 최종 합격자에게는 개별 연락드립니다.</p>
            </section>
          </div>
        </div>
      </article>
    </main>
    <SiteFooter />
  </>
}
