import { DistributionChart } from "@/components/distribution-chart"
import { CompanyLogo } from "@/components/company-logo"
import { MembersDirectory } from "@/components/members-directory"
import type { MemberResult } from "@/lib/member-model"
import { NetworkTabs } from "@/components/network-tabs"

const distribution = [
  { name: "금융권", value: 80 }, { name: "대기업", value: 9 },
  { name: "공기업", value: 4 }, { name: "기타", value: 7 },
]
const companies = ["BNK투자증권", "상상인증권", "한화투자증권", "흥국자산운용", "라이나생명", "한국자산관리공사", "한국IR협의회", "우리은행", "펌텍코리아", "NH투자증권", "하나은행", "IBK기업은행", "트로이투자일임", "iM증권", "LS증권", "유안타증권", "한국산업은행", "타이거자산운용투자일임", "KB투자증권", "한국투자증권", "신용보증기금", "한국투자신탁운용", "신한투자증권", "미래에셋증권", "주택도시보증공사", "코리아에셋투자증권", "수협", "타임폴리오자산운용", "NICE평가정보", "노을", "PwC", "한국기업평가", "한국주택금융공사", "넥센타이어", "신한은행"]

export function AlumniOverview({ generation, members }: { generation?: number; members: MemberResult }) {
  return <main className="relative z-10 mx-auto max-w-6xl px-6 py-14 text-white">
    <NetworkTabs active="alumni" />
    <section className="pb-24 sm:pb-32">
      <p className="text-xs tracking-[.3em] text-sky-300">NETWORK · ALUMNI</p>
      <h1 className="mt-6 text-3xl font-light leading-snug sm:text-5xl">세대를 잇는 네트워크,<br /><span className="font-medium">함께 성장하는 SMP</span></h1>
      <p className="mt-7 max-w-2xl leading-loose text-slate-200">금융권을 비롯한 다양한 분야에서 활동하는 선배들과 경험과 지식을 나눕니다.<br />서울과 부산에서 진행하는 홈커밍데이를 통해 기수 간 교류를 이어갑니다.</p>
    </section>
    <section className="grid gap-14 border-t border-white/20 py-20 md:grid-cols-2 md:items-center">
      <div><p className="text-xs tracking-[.3em] text-sky-300">WHERE WE ARE</p><h2 className="mt-5 text-4xl font-light">진출 현황</h2><p className="mt-6 leading-loose text-slate-200">기업과 시장을 분석하며 쌓은 경험은 금융권을 넘어 다양한 분야로 이어집니다.</p></div>
      <DistributionChart items={distribution} />
    </section>
    <section className="border-t border-white/20 py-20"><p className="text-xs tracking-[.3em] text-sky-300">COMPANIES</p><h2 className="mt-5 text-4xl font-light">재직 현황</h2><p className="mt-5 text-sm text-slate-300">SMP 선배들이 진출한 기업과 기관</p><div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{companies.map((company, index) => <div key={company} className="relative flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/30 px-5 py-4"><CompanyLogo index={index} name={company} /></div>)}</div><p className="mt-5 text-xs leading-relaxed text-slate-300">기업·기관명은 제공된 Alumni 자료 기준입니다.</p></section>
    <section className="border-t border-white/20 py-20"><p className="text-xs tracking-[.3em] text-sky-300">OUR PEOPLE</p><h2 className="mt-5 text-4xl font-light">ALUMNI</h2><MembersDirectory key={generation} result={members} initialGeneration={generation} /></section>
  </main>
}
