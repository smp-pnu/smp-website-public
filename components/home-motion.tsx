"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import "./home-motion.css"

/** Entrance decoration only: content and links are readable before it runs. */
export function HomeEntrance({ children, className = "", id }: {
  children: ReactNode
  className?: string
  id?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!root.current) return
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEntered(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setEntered(true)
      observer.disconnect()
    }, { threshold: 0.15 })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  return <div ref={root} id={id} className={`home-entrance ${className}`} data-entered={entered}>{children}</div>
}

export function HomePanorama() {
  return <HomeEntrance className="home-panorama" id="home-perspective">
    <div className="home-panorama__right" aria-hidden="true">
      <div className="home-panorama__left">
        <picture>
          <source media="(max-width: 767px)" srcSet="/backgrounds/pnu-campus-upscaled-mobile.webp" />
          <img className="home-panorama__image" src="/backgrounds/pnu-campus-upscaled.webp" alt="" width={1920} height={1280} loading="lazy" decoding="async" />
        </picture>
      </div>
    </div>
  </HomeEntrance>
}
