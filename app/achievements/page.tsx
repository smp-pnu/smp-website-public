import type { Metadata } from "next"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { awardGroups } from "@/lib/awards"

export const metadata: Metadata = { title: "ACHIEVEMENTS | SMP" }

export default function AchievementsPage() {
  return <>
    <SiteHeader />
    <main className="relative z-10">
      <div className="site-page max-w-6xl">
        <PageIntro eyebrow="SMP RECORD" title="ACHIEVEMENTS">SMP의 대회 수상과 활동 성과입니다.</PageIntro>
        <nav aria-label="수상 연도" className="mt-10 flex flex-wrap justify-center gap-2 border-b border-site-line pb-6">
          {awardGroups.map((group, index) => <a key={group.year} href={`#awards-${index}`} className="inline-flex min-h-11 items-center rounded-[4px] border border-site-line bg-white/[0.025] px-3 text-sm text-site-body transition-colors hover:bg-white/5 hover:text-site-accent focus-visible:outline-2 focus-visible:outline-site-accent">{group.year}</a>)}
        </nav>
        {awardGroups.map((group, index) => <section key={group.year} id={`awards-${index}`} className="grid scroll-mt-24 gap-6 border-b border-site-line py-12 md:grid-cols-[160px_1fr] md:gap-12">
          <h2 className="text-2xl font-light text-site-accent sm:text-3xl">{group.year}</h2>
          <ul className="divide-y divide-site-line-soft">
            {group.awards.map(([title, result]) => <li key={`${title}-${result}`} className="grid gap-2 py-5 first:pt-0 last:pb-0 lg:grid-cols-[1fr_220px] lg:gap-8">
              <h3 className="text-base font-normal leading-relaxed text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-site-accent lg:text-right">{result}</p>
            </li>)}
          </ul>
        </section>)}
      </div>
    </main>
    <SiteFooter />
  </>
}
