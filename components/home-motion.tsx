"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import "./home-motion.css"

/** Progressive decoration: static HTML and reduced-motion content stay visible. */
export function HomeEntrance({ children, className = "", id }: {
  children: ReactNode
  className?: string
  id?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<"static" | "waiting" | "entered">("static")
  useEffect(() => {
    const element = root.current
    if (!element || !("IntersectionObserver" in window)) return
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    let entered = false
    const observer = new IntersectionObserver(([entry]) => {
      if (preference.matches || entered) return
      // Keep focused links visible, even when keyboard navigation skips a section.
      if (element.contains(document.activeElement)) {
        setPhase("static")
      } else if (!entry.isIntersecting && (entry.boundingClientRect.bottom <= 0 || entry.boundingClientRect.top >= window.innerHeight)) {
        // Prepare the first entrance only; returning readers keep stable content.
        setPhase("waiting")
      } else if (entry.intersectionRatio >= 0.2) {
        entered = true
        setPhase("entered")
        observer.disconnect()
      }
    }, { threshold: [0, 0.2] })
    const syncPreference = () => {
      observer.disconnect()
      setPhase("static")
      if (!preference.matches) observer.observe(element)
    }
    syncPreference()
    preference.addEventListener("change", syncPreference)
    return () => {
      observer.disconnect()
      preference.removeEventListener("change", syncPreference)
    }
  }, [])
  return <div ref={root} id={id} className={`home-entrance ${className}`} data-motion={phase} onFocusCapture={() => setPhase("static")}>{children}</div>
}
