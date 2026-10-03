import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { awardGroups } from "@/lib/awards"

export const metadata: Metadata = { title: "ACHIEVEMENTS | SMP" }

export default function AchievementsPage() {
  return <>
    <SiteHeader />
    <main className="relative z-10 bg-black/30">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <h1 className="text-xs font-normal tracking-[0.3em] text-sky-300">ACHIEVEMENTS</h1>
        <nav aria-label="수상 연도" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-b border-white/20 pb-8">
          {awardGroups.map((group, index) => <a key={group.year} href={`#awards-${index}`} className="text-sm text-slate-300 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-sky-300">{group.year}</a>)}
        </nav>
        {awardGroups.map((group, index) => <section key={group.year} id={`awards-${index}`} className="grid scroll-mt-24 gap-6 border-b border-white/20 py-12 md:grid-cols-[160px_1fr] md:gap-12">
          <h2 className="text-2xl font-light text-sky-300 sm:text-3xl">{group.year}</h2>
          <ul className="divide-y divide-white/10">
            {group.awards.map(([title, result]) => <li key={`${title}-${result}`} className="grid gap-2 py-5 first:pt-0 last:pb-0 lg:grid-cols-[1fr_220px] lg:gap-8">
              <h3 className="text-base font-normal leading-relaxed text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-sky-200 lg:text-right">{result}</p>
            </li>)}
          </ul>
        </section>)}
      </div>
    </main>
    <SiteFooter />
  </>
}
