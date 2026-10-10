"use client"

import { useEffect, useRef, useState } from "react"

export function HeroSection() {
  const panelWidth = "clamp(320px, 42vw, 620px)"
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

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
      <div className={`hero-shadow absolute inset-y-0 left-0 bg-black/55 ${isVisible ? "is-visible" : ""}`} style={{ width: panelWidth }} aria-hidden="true" />
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

