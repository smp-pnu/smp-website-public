"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"

export function HeroSection() {
  const [panelWidth, setPanelWidth] = useState("min(72vw, 360px)")
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const menu = document.querySelector<HTMLElement>('nav[aria-label="주요 메뉴"]')
    const updateWidth = () => {
      const homeLink = menu?.querySelector<HTMLAnchorElement>('a[href="/"]')
      setPanelWidth(homeLink && window.innerWidth >= 1024
        ? `${Math.max(120, homeLink.getBoundingClientRect().left - 24)}px`
        : "min(72vw, 360px)")
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    if (menu) observer.observe(menu)
    window.addEventListener("resize", updateWidth)
    document.fonts.ready.then(updateWidth)
    return () => { observer.disconnect(); window.removeEventListener("resize", updateWidth) }
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.2 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="site-hero"
      className="relative flex min-h-[100svh] w-full items-center overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 [clip-path:inset(0)]" aria-hidden="true">
        <div className="fixed inset-0">
          <Image src="/home-gwangan-3.png" alt="" fill priority sizes="100vw" className="object-cover object-center" />
        </div>
      </div>
      <div className={`hero-shadow absolute inset-y-0 left-0 bg-black/50 ${isVisible ? "is-visible" : ""}`} style={{ width: panelWidth }} aria-hidden="true" />
      <div className="relative z-10 flex min-h-[100svh] items-center px-[clamp(20px,3vw,64px)] py-28" style={{ width: panelWidth }}>

        <div className="w-full [container-type:inline-size]">
        <h1 data-hero-title className={`hero-title font-[family-name:var(--font-hero)] text-left text-[min(16cqw,5.5rem)] font-light leading-[1.3] tracking-tight text-white ${isVisible ? "is-visible" : ""}`}>
          STOCK<br /><span className="whitespace-nowrap">MASTERS OF</span><br />PNU
        </h1>
        </div>



      </div>
    </section>
  )
}

