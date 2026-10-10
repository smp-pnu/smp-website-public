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
    return () => stepObserver.disconnect()
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
  return <main ref={root} onClick={moveToStage} className="relative z-10">
    <div className="relative">{children}</div>
  </main>
}
