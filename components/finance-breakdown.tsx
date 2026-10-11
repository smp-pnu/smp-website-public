import { ChevronDown } from "lucide-react"
import { financialEmployerCount, financialSectors } from "@/lib/alumni-employers"

export function FinanceBreakdown() {
  return <section aria-labelledby="finance-breakdown-title" className="rounded border border-site-line bg-site-surface p-5 sm:p-7 md:col-span-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="finance-breakdown-title" className="text-base font-medium text-white">금융 분야 세부 현황</h3>
      <p className="text-xs text-site-muted">공개 자료에 수록된 {financialEmployerCount}개 회사·기관</p>
    </div>
    <div className="mt-5 grid items-start gap-x-7 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {financialSectors.map(sector => <details key={sector.name} className="group">
        <summary className="cursor-pointer list-none rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-site-accent [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-site-body">{sector.name}</span>
            <span className="tabular-nums text-site-accent">{sector.companies.length}<span className="ml-1 text-xs text-site-muted">개</span></span>
            <ChevronDown size={14} className="text-site-muted group-open:rotate-180" aria-hidden="true" />
          </span>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-sky-200/80" style={{ width: `${sector.companies.length / financialEmployerCount * 100}%` }} />
          </span>
        </summary>
        <p className="mt-3 text-xs leading-6 text-site-muted">{sector.companies.join(" · ")}</p>
      </details>)}
    </div>
    <p className="mt-5 text-xs leading-6 text-site-muted">회사·기관 수 기준이며 재직 인원 비율과는 다릅니다. 분야를 누르면 해당 회사·기관을 볼 수 있습니다.</p>
  </section>
}
