"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export function ScrollReveal() {
  const pathname = usePathname()
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const elements = document.querySelectorAll<HTMLElement>("main h1:not([data-hero-title]), main h2, main h3, main p, main a, main section span.text-xs")
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting))
    }, { threshold: 0, rootMargin: "0px 0px -24px 0px" })
    elements.forEach((element) => { if (!element.hasAttribute("data-stage-link")) element.classList.add("reveal-text") })
    const frame = requestAnimationFrame(() => elements.forEach((element) => observer.observe(element)))
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      elements.forEach((element) => element.classList.remove("reveal-text", "is-visible"))
    }
  }, [pathname])
  return null
}
