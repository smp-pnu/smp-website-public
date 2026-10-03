import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { HeroSection } from "@/components/sections/hero-section"
import { WhoWeAreSection } from "@/components/sections/who-we-are-section"
import { WhatWeDoSection } from "@/components/sections/what-we-do-section"
import { AchievementsSection } from "@/components/sections/achievements-section"
import { AlumniSection } from "@/components/sections/alumni-section"
import { RecruitSection } from "@/components/sections/recruit-section"
import { BackgroundChapter } from "@/components/background-chapter"
import { LatestResearchSection } from "@/components/sections/latest-research-section"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="relative z-10">
        <HeroSection />
        <BackgroundChapter image="/central-business-district-singapore.jpg">
          <WhoWeAreSection />
          <WhatWeDoSection />
        </BackgroundChapter>
        <BackgroundChapter image="/wall-street.jpg">
          <AchievementsSection />
          <AlumniSection />
          <LatestResearchSection />
          <RecruitSection />
          <SiteFooter />
        </BackgroundChapter>
      </main>
    </>
  )
}
