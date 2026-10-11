import { alumniEmployers } from "@/lib/alumni-employers"
import { FinanceBreakdown } from "./finance-breakdown"
import { NetworkLayout } from "./network-layout"
import { DistributionChart } from "@/components/distribution-chart"
import { CompanyLogo } from "@/components/company-logo"
import { MembersDirectory } from "@/components/members-directory"
import type { MemberResult } from "@/lib/member-model"

const distribution = [
  { name: "금융권", value: 80 }, { name: "대기업", value: 9 },
  { name: "공기업", value: 4 }, { name: "기타", value: 7 },
]

export function AlumniOverview({ generation, members }: { generation?: number; members: MemberResult }) {
  return <NetworkLayout active="alumni">
    <section className="grid gap-14 border-t border-site-line py-20 md:grid-cols-2 md:items-center">
      <div><p className="text-xs tracking-[.3em] text-site-accent">WHERE WE ARE</p><h2 className="mt-5 text-4xl font-light">진출 현황</h2><p className="mt-6 leading-loose text-site-body">기업과 시장을 분석하며 쌓은 경험은 금융권을 넘어 다양한 분야로 이어집니다.</p></div>
      <div><DistributionChart items={distribution} /><p className="mt-5 text-xs leading-6 text-site-muted">제공된 Alumni 자료 기준 · 전체 진출 비율</p></div>
      <FinanceBreakdown />
    </section>
    <section className="border-t border-site-line py-20"><p className="text-xs tracking-[.3em] text-site-accent">COMPANIES</p><h2 className="mt-5 text-4xl font-light">재직 현황</h2><p className="mt-5 text-sm text-site-body">SMP 선배들이 진출한 기업과 기관</p><div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{alumniEmployers.map(({ name: company }, index) => <div key={company} className="relative flex min-h-28 items-center justify-center overflow-hidden rounded-[4px] border border-site-line bg-site-surface px-5 py-4"><CompanyLogo index={index} name={company} /></div>)}</div><p className="mt-5 text-xs leading-relaxed text-site-body">기업·기관명은 제공된 Alumni 자료 기준입니다.</p></section>
    <section className="border-t border-site-line py-20"><p className="text-xs tracking-[.3em] text-site-accent">OUR PEOPLE</p><h2 className="mt-5 text-4xl font-light">ALUMNI</h2><MembersDirectory key={generation} result={members} initialGeneration={generation} /></section>
  </NetworkLayout>
}
