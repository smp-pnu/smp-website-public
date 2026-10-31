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
