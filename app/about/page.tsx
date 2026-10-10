import type { Metadata } from "next"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = { title: "ABOUT | SMP" }

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="site-page max-w-4xl">
        <PageIntro eyebrow="SMP ABOUT" title="ABOUT SMP" />
        <div className="mt-12 space-y-8 text-base leading-[2] text-site-body sm:text-lg">
          <p>SMP는 2006년부터 이어져 온 부산대학교 최초이자 유일의 금융투자동아리입니다. 기업의 내재가치를 분석하고 그 가치를 실제 투자로 검증하는 가치투자를 중심으로, 산업과 기업에 대한 깊이 있는 리서치와 포트폴리오 운용을 함께 이어오고 있습니다. 단순히 금융 지식을 배우는 데 그치지 않고, 직접 기업을 분석해 적정가치를 산출하고 정규 세션에서 치열하게 토론하며, 실제 시장에서 자신들의 투자 논리를 검증합니다.</p>
          <p>40기에 이르기까지 SMP는 기업분석, 포트폴리오 운용, 금융투자 대회 등 다양한 무대에서 꾸준히 성과를 쌓아왔으며, 전국 대학 투자학회와의 교류와 선후배 네트워크를 통해 활동의 범위를 넓혀왔습니다. 부산대학교 금융투자 학술활동의 시작을 함께해온 학회라는 자부심, 그리고 오랜 시간 축적해온 리서치 경험과 투자 철학을 바탕으로 SMP는 지금도 더 깊이 분석하고, 더 논리적으로 투자하며, 다음 세대의 투자자를 만들어가고 있습니다.</p>
        </div>
        <section className="mt-20 border-t border-site-line pt-16 sm:mt-28 sm:pt-20">
          <h2 className="text-xs font-normal tracking-[0.3em] text-site-accent">OUR PHILOSOPHY</h2>
          <p className="mt-6 text-2xl font-medium leading-snug text-white sm:text-3xl">좋은 투자는 좋은 질문에서 시작됩니다.</p>
          <p className="mt-8 text-base leading-[2] text-site-body sm:text-lg">우리는 기업이 어떤 사업을 하고, 어떤 산업에서 경쟁하며, 어떤 가치를 만들어내는지 먼저 고민합니다. 경제와 산업을 이해하고 기업을 분석하며 자신만의 투자 판단 기준을 만들고, 실제 투자와 피드백을 통해 그 기준을 발전시켜 나갑니다.</p>
        </section>
        <section className="mt-20 border-t border-site-line pt-16 sm:mt-28 sm:pt-20">
          <h2 className="text-xs font-normal tracking-[0.3em] text-site-accent">OUR VISION</h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {[
              { title: "ANALYZE", body: "기업과 산업을 깊이 분석하며 시장을 해석하는 힘을 기릅니다." },
              { title: "INVEST", body: "분석을 투자 아이디어로 발전시키고 실제 시장에서 검증합니다." },
              { title: "GROW", body: "발표와 토론, 선후배 간의 피드백을 통해 함께 성장합니다." },
            ].map(({ title, body }) => (
              <div key={title}>
                <h3 className="text-2xl font-light tracking-wide text-white">{title}</h3>
                <p className="mt-5 text-base leading-[2] text-site-body">{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-20 border-t border-site-line pt-16 sm:mt-28 sm:pt-20">
          <h2 className="text-xs font-normal tracking-[0.3em] text-site-accent">SINCE 2006</h2>
          <p className="mt-6 text-2xl font-medium leading-snug text-white sm:text-3xl">분석과 투자의 경험을 다음 기수로 이어갑니다.</p>
          <p className="mt-8 text-base leading-[2] text-site-body sm:text-lg">2006년 시작된 SMP는 40기까지 활동을 이어오고 있습니다. 기업분석과 실제 투자를 중심으로 배움을 축적하며, 대외활동과 교류를 통해 활동 영역을 넓혀가고 있습니다.</p>
        </section>
        <section className="mt-20 border-t border-site-line pt-16 sm:mt-28 sm:pt-20">
          <h2 className="text-xs font-normal tracking-[0.3em] text-site-accent">5 TEAMS ONE SMP</h2>
          <p className="mt-6 text-2xl font-medium leading-snug text-white sm:text-3xl">4개의 Research Team과 1개의 Trading Team이 함께합니다.</p>
          <div className="mt-10 grid grid-cols-2 gap-8 text-white">
            <div><p className="text-5xl font-light text-site-accent">4</p><p className="mt-3 text-sm tracking-wide sm:text-base">Research Teams</p></div>
            <div><p className="text-5xl font-light text-site-accent">1</p><p className="mt-3 text-sm tracking-wide sm:text-base">Trading Team</p></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
