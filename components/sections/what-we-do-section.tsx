import { LineChart, Users, BookOpenText } from "lucide-react"

const ACTIVITIES = [
  {
    icon: BookOpenText,
    title: "RESEARCH",
    description: ["산업과 사업 구조, 성장 가능성, 재무적 가치를 분석해", "기업의 적정가치를 산출하는 리포트를 작성합니다."],
  },
  {
    icon: LineChart,
    title: "TRADING",
    description:
      ["국내·해외 주식과 원자재 등 다양한 자산을 활용해 학회", "자금을 운용하고, R팀에 시장 관점의 피드백을 제공합니다."],
  },
  {
    icon: Users,
    title: "SESSION",
    description:
      ["매주 화·금 정규 세션에서 리서치와 시장 관점을 공유하고,", "질의응답을 통해 투자 논리를 검증합니다."],
  },
]

export function WhatWeDoSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-[1600px]">
        <div className="text-center">
          <span className="text-xs font-normal tracking-[0.3em] text-sky-300">WHAT WE DO</span>
          <h2 className="mt-4 text-2xl font-medium leading-snug text-white sm:text-3xl">
            분석하고, 투자하고, 토론하며 시장을 보는 힘을 기릅니다.
          </h2>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {ACTIVITIES.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex flex-col items-start gap-4 px-2 py-8"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center text-sky-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="font-[family-name:var(--font-display)] text-lg font-normal tracking-tight text-white">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">{description.map(line => <span key={line} className="block">{line}</span>)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

