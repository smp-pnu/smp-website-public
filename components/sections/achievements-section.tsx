import Link from "next/link"
import { Trophy, ArrowRight } from "lucide-react"

const awards = [
  {
    year: "2025/26",
    title: "CFA Research Challenge Korea Final",
    result: "4위",
  },
  {
    year: "2026",
    title: "제9회 부증련 기업분석대회",
    result: "대상 · 최우수상 · 우수상",
  },
  {
    year: "2025",
    title: "제1회 UIC 포트폴리오 운용대회",
    result: "최우수상",
  },
  {
    year: "2025",
    title: "제5기 한국거래소 KRX FutureStar",
    result: "이사장상 · 부산시장상",
  },
]

export function AchievementsSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-xs font-normal tracking-[0.3em] text-site-accent">ACHIEVEMENTS</h2>
        </div>

        <div className="mx-auto mt-12 grid gap-4 sm:grid-cols-2">
          {awards.map((award) => (
            <div
              key={award.title}
              className="flex flex-col items-center gap-3 p-6 text-center"
            >
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center text-site-accent">
                <Trophy className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-normal tracking-wide text-site-muted">{award.year}</span>
                <h3 className="text-base font-medium leading-snug text-white">{award.title}</h3>
                <p className="text-sm leading-relaxed text-site-accent">{award.result}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/achievements"
            className="inline-flex items-center gap-2 text-sm font-normal text-site-accent transition-colors hover:text-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            MORE ACHIEVEMENTS
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

