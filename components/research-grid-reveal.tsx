"use client"

import { useEffect, useRef, type ReactNode } from "react"

export function ResearchGridReveal({ children }: { children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const element = list.current
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return
    const cards = Array.from(element.children) as HTMLElement[]
    const columns = getComputedStyle(element).gridTemplateColumns.split(" ").length
    const initiallyVisible = cards.map(card => card.getBoundingClientRect().top < window.innerHeight)
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.setAttribute("data-visible", "true")
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" })
    cards.forEach((card, index) => {
      // Do not hide already-painted, above-the-fold cards during hydration.
      if (initiallyVisible[index]) return
      card.style.setProperty("--card-delay", `${(index % columns) * 35}ms`)
      card.setAttribute("data-reveal", "ready")
      observer.observe(card)
    })
    return () => {
      observer.disconnect()
      cards.forEach(card => { card.removeAttribute("data-reveal"); card.removeAttribute("data-visible") })
    }
  }, [])
  return <ul ref={list} data-card-grid aria-label="리포트 목록" className="grid grid-cols-1 gap-x-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</ul>
}
