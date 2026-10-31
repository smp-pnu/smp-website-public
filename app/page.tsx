import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { HeroSection } from "@/components/sections/hero-section"
import { WhoWeAreSection } from "@/components/sections/who-we-are-section"
import { WhatWeDoSection } from "@/components/sections/what-we-do-section"
import { AchievementsSection } from "@/components/sections/achievements-section"
import { AlumniSection } from "@/components/sections/alumni-section"
import { RecruitSection } from "@/components/sections/recruit-section"
import { BackgroundChapter } from "@/components/background-chapter"
import { HomeStatement } from "@/components/home-experiment"
import "@/components/home-experiment.css"
import { LatestResearchSection } from "@/components/sections/latest-research-section"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="home-experiment relative z-10">
        <HeroSection />
        <HomeStatement />
        <BackgroundChapter image="/backgrounds/central-business-district-singapore.webp">
          <WhoWeAreSection />
          <LatestResearchSection />
          <WhatWeDoSection />
        </BackgroundChapter>
        <BackgroundChapter image="/wall-street.jpg">
          <AchievementsSection />
          <AlumniSection />
          <RecruitSection />
          <SiteFooter />
        </BackgroundChapter>
      </main>
    </>
  )
}
