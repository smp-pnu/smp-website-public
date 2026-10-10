import type { Metadata } from "next"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { CurriculumMotion } from "@/components/curriculum-motion"

export const metadata: Metadata = { title: "CURRICULUM | SMP" }

const stages = [
  { id: "foundation", name: "신입교육", label: "RESEARCH FOUNDATION", summary: "리서치와 가치평가의 기초", description: "기업분석을 시작하기 위한 기초를 다집니다. 기업 선정부터 리포트의 구성과 흐름을 익히고, 기업의 적정가치를 산출하기 위한 Valuation 모델링을 배웁니다.", topics: ["기업 선정 및 리포트 구성 이해", "리서치 기초 교육", "재무 모델링과 기업가치 평가"] },
  { id: "junior", name: "Junior 정규세션", label: "RESEARCH & ACTING FUND", summary: "기업분석과 투자 포트폴리오 운용", description: "가치투자를 위한 기업분석과 투자 포트폴리오 운용을 함께 경험합니다. 정규세션에서 쌓은 리서치 역량을 바탕으로 다양한 대외활동에도 참여합니다.", topics: ["가치투자를 위한 기업분석", "Acting Fund · 투자 포트폴리오 운용", "리서치 역량을 활용한 대외활동"] },
  { id: "vacation", name: "방중세션", label: "TEAM RESEARCH", summary: "팀 리포트로 다지는 분석 역량", description: "Senior로 성장하기 위해 분석 역량을 한 단계 높입니다. 신입 기수끼리 팀을 구성해 기업을 분석하고, 하나의 투자 논리를 담은 리포트를 함께 작성합니다.", topics: ["신입 기수 중심의 팀 구성", "팀별 기업분석 리포트 작성", "Senior 정규세션을 위한 역량 강화"] },
  { id: "senior", name: "Senior 정규세션", label: "LEADERSHIP & INVESTMENT", summary: "리서치를 이끌고 투자로 검증", description: "기존 기수로서 신입 기수를 지도하고, 리포트 작성을 주도합니다. 팀 펀드를 운용하며 분석을 실제 투자로 연결하고, 대회 참가를 통해 경험을 넓힙니다.", topics: ["신입 기수 지도 및 리포트 작성 주도", "팀 펀드 자금 운용 · 총 70–100만 원 규모", "금융투자 대회 참가"] },
]

export default function CurriculumPage() {
  return <>
    <SiteHeader />
    <CurriculumMotion>
      <div className="mx-auto max-w-6xl px-6">
        <section className="pt-14 pb-16 sm:pt-18 sm:pb-20">
          <PageIntro eyebrow="CURRICULUM" title="금융리더를 향한 네 번의 도약">리서치의 기초를 배우고, 기업을 분석하고, 팀과 함께 투자합니다.<br />SMP의 정규 커리큘럼은 신입교육부터 Senior 정규세션까지 이어집니다.</PageIntro>
          <nav aria-label="커리큘럼 4단계" className="mt-12 sm:mt-14">
            <ol className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
              {stages.map((stage, index) => <li key={stage.id} className="curriculum-step-item" style={{ animationDelay: `${index * 180}ms` }}>
                <a data-stage-link href={`#${stage.id}`} className="curriculum-stage block pt-5 focus-visible:outline-2 focus-visible:outline-site-accent">
                  <span aria-hidden="true" className="curriculum-bar"><span style={{ animationDelay: `${300 + index * 450}ms`, background: ["#ffffff", "#b9ddff", "#6cb5ff", "#2585ed"][index] }} /></span>
                  <span className="text-xs tracking-[0.16em] text-site-accent">STEP 0{index + 1}</span>
                  <span className="mt-3 block text-lg font-medium text-white sm:text-xl">{stage.name}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-site-body">{stage.summary}</span>
                </a>
              </li>)}
            </ol>
          </nav>
        </section>
        {stages.map((stage, index) => <section key={stage.id} id={stage.id} tabIndex={-1} className="grid scroll-mt-24 gap-8 border-t border-site-line py-14 sm:py-20 md:grid-cols-[1fr_1.5fr] md:gap-16">
          <div><p className="text-xs tracking-[0.2em] text-site-accent">STEP 0{index + 1} · {stage.label}</p><h2 className="mt-4 text-3xl font-light text-white">{stage.name}</h2></div>
          <div>
            <h3 className="text-xl font-normal text-white">{stage.summary}</h3>
            <p className="mt-5 text-base leading-loose text-site-body">{stage.description}</p>
            <ul className="mt-7 space-y-3 border-l border-sky-300/50 pl-5 text-sm leading-relaxed text-site-body">{stage.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
          </div>
        </section>)}
      </div>
    </CurriculumMotion>
    <SiteFooter />
  </>
}
