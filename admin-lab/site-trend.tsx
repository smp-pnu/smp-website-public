import { useId, useState } from "react"

export type TrendDay = { day: string; views: number; visits: number; downloads: number }
const count = (value: number) => value.toLocaleString("ko-KR")
export function SiteTrend({ days }: { days: TrendDay[] }) {
  const [active, setActive] = useState<number | null>(null)
  const id = useId(), maximum = Math.max(1, ...days.map(day => day.views))
  const current = active === null ? null : days[active]
  return <div className="site-trend" onPointerLeave={() => setActive(null)} onKeyDown={event => {
    if (event.key === "Escape") setActive(null)
  }}>
    <div className="site-bars" role="group" aria-label="일별 조회 추이 · 막대를 선택하면 상세 수치를 확인합니다">
      {days.map((day, index) => <button key={day.day} type="button" className="site-bar"
        aria-label={`${day.day} · 조회 ${count(day.views)}회 · 방문 ${count(day.visits)}회 · 다운로드 클릭 ${count(day.downloads)}회`}
        aria-describedby={active === index ? id : undefined} data-active={active === index || undefined}
        onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)}
        onBlur={() => setActive(null)} onClick={() => setActive(index)}>
        <span style={{ height: `${day.views / maximum * 100}%` }} />
      </button>)}
    </div>
    {current && <div id={id} role="tooltip" className="site-chart-tooltip"
      style={{ left: `clamp(92px, ${(active! + .5) / days.length * 100}%, calc(100% - 92px))` }}>
      <strong>{current.day.replaceAll("-", ".")}</strong>
      <dl><div><dt>페이지 조회</dt><dd>{count(current.views)}회</dd></div>
        <div><dt>방문</dt><dd>{count(current.visits)}회</dd></div>
        <div><dt>다운로드 클릭</dt><dd>{count(current.downloads)}회</dd></div></dl>
    </div>}
    <div className="site-chart-axis"><span>{days[0]?.day.slice(5)}</span><span>일별 조회 · 최대 {count(maximum)}회</span><span>{days.at(-1)?.day.slice(5)}</span></div>
  </div>
}
