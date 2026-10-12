import { financialEmployerCount, financialSectors } from "@/lib/alumni-employers"

export function FinanceBreakdown() {
  return <section aria-labelledby="finance-breakdown-title" className="rounded border border-site-line bg-site-surface p-5 sm:p-7 md:col-span-2">
    <h3 id="finance-breakdown-title" className="text-base font-medium text-white">금융 분야 세부 현황</h3>
    <div className="mt-5 grid items-start gap-x-7 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {financialSectors.map(sector => <div key={sector.name} aria-label={`${sector.name}: ${sector.companies.length}개`}>
        <span className="flex items-center gap-2 text-sm">
          <span className="flex-1 text-site-body">{sector.name}</span>
          <span className="tabular-nums text-site-accent">{sector.companies.length}<span className="ml-1 text-xs text-site-muted">개</span></span>
        </span>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <span className="block h-full rounded-full bg-sky-200/80" style={{ width: `${sector.companies.length / financialEmployerCount * 100}%` }} />
        </span>
      </div>)}
    </div>
  </section>
}
