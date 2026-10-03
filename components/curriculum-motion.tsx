"use client"
import { useEffect, useRef, type ReactNode, type MouseEvent } from "react"

export function CurriculumMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = root.current!
    const steps = element.querySelector<HTMLElement>('nav[aria-label="커리큘럼 4단계"]')!
    const stepObserver = new IntersectionObserver(([entry]) => {
      steps.classList.toggle("steps-visible", entry.isIntersecting)
    }, { threshold: 0, rootMargin: "-72px 0px -32px 0px" })
    stepObserver.observe(steps)
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0
    let current = 0
    let target = 0
    let previous = 0
    const update = (time: number) => {
      frame = 0
      const dt = previous ? Math.min(time - previous, 64) : 16
      previous = time
      current = reduced.matches ? 0 : current + (target - current) * (1 - Math.exp(-dt / 220))
      element.style.setProperty("--light-x", `${18 + current * 64}%`)
      element.style.setProperty("--photo-y", `${(reduced.matches ? target : current) * 100}%`)
      if (!reduced.matches && Math.abs(target - current) > 0.0001) frame = requestAnimationFrame(update)
      else previous = 0
    }
    const schedule = () => {
      const rect = element.getBoundingClientRect()
      target = Math.min(1, Math.max(0, -rect.top / Math.max(1, element.offsetHeight - window.innerHeight)))
      if (!frame) frame = requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    reduced.addEventListener("change", schedule)
    return () => { stepObserver.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); reduced.removeEventListener("change", schedule) }
  }, [])
  const moveToStage = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-stage-link]")
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
    const target = document.getElementById(link.hash.slice(1))
    if (!target) return
    event.preventDefault()
    history.pushState(null, "", link.hash)
    target.focus({ preventScroll: true })
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })
  }
  return <main ref={root} onClick={moveToStage} className="curriculum-page relative z-10 isolate">
    <div className="curriculum-atmosphere" aria-hidden="true"><div className="curriculum-beam" /><div className="curriculum-horizon" /><div className="curriculum-star" /></div>
    <div className="relative">{children}</div>
  </main>
}
