"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SITE_NAME_KO } from "@/lib/site-config"

export function HeroSection() {
  const panelWidth = "clamp(320px, 42vw, 620px)"

  return (
    <section
      id="site-hero"
      className="relative flex min-h-[100svh] w-full items-center overflow-hidden"
    >
      <div className="absolute inset-y-0 left-0 bg-black/55" style={{ width: panelWidth }} aria-hidden="true" />
      <div className="relative z-10 flex min-h-[100svh] items-center px-[clamp(20px,3vw,64px)] py-28" style={{ width: panelWidth }}>

        <div className="w-full [container-type:inline-size]">
        <h1 className="font-[family-name:var(--font-hero)] text-left text-[min(16cqw,5.5rem)] font-light leading-[1.3] tracking-tight text-white">
          STOCK<br /><span className="whitespace-nowrap">MASTERS OF</span><br />PNU
        </h1>
        <p className="mt-7 font-[family-name:var(--font-body)] text-sm font-normal leading-relaxed text-white/85 sm:text-base">{SITE_NAME_KO}</p>
        <nav aria-label="주요 활동 바로가기" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white">
          <Link href="/research" prefetch={false} className="hero-shortcut">리포트 보기 <ArrowRight className="hero-shortcut__arrow" size={18} strokeWidth={1.5} aria-hidden="true" /></Link>
          <Link href="/recruit" prefetch={false} className="hero-shortcut">모집 안내 <ArrowRight className="hero-shortcut__arrow" size={18} strokeWidth={1.5} aria-hidden="true" /></Link>
        </nav>
        </div>



      </div>
    </section>
  )
}

