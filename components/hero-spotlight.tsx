"use client"

import { useEffect, useRef } from "react"

/** A single, bounded gradient layer. Pointer movement never renders React or fetches data. */
export function HeroSpotlight({ inset }: { inset: string }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const lightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const area = areaRef.current
    const light = lightRef.current
    const hero = area?.parentElement
    if (!area || !light || !hero) return
    const enabled = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)")
    let detach = () => {}

    const configure = () => {
      detach()
      if (!enabled.matches) return
      let bounds: DOMRect | null = null
      let frame = 0
      let previous = 0
      let active = false
      let x = 0, y = 0, targetX = 0, targetY = 0

      const hide = () => {
        active = false
        bounds = null
        previous = 0
        cancelAnimationFrame(frame)
        frame = 0
        delete area.dataset.active
      }
      const draw = (time: number) => {
        const step = 1 - Math.exp(-Math.min(previous ? time - previous : 16, 64) / 70)
        previous = time
        x += (targetX - x) * step
        y += (targetY - y) * step
        light.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
        // Stop entirely at rest; another pointer event schedules the next frame.
        frame = Math.abs(targetX - x) + Math.abs(targetY - y) > .2 ? requestAnimationFrame(draw) : 0
        if (!frame) previous = 0
      }
      const move = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || document.hidden) return
        bounds ??= area.getBoundingClientRect()
        targetX = event.clientX - bounds.left
        targetY = event.clientY - bounds.top
        if (targetX < 0 || targetX > bounds.width || targetY < 0 || targetY > bounds.height) {
          if (active) hide()
          return
        }
        if (!active) {
          x = targetX
          y = targetY
          active = true
          area.dataset.active = ""
        }
        if (!frame) frame = requestAnimationFrame(draw)
      }
      hero.addEventListener("pointermove", move, { passive: true })
      hero.addEventListener("pointerleave", hide)
      window.addEventListener("scroll", hide, { passive: true })
      window.addEventListener("resize", hide)
      document.addEventListener("visibilitychange", hide)
      detach = () => {
        hide()
        hero.removeEventListener("pointermove", move)
        hero.removeEventListener("pointerleave", hide)
        window.removeEventListener("scroll", hide)
        window.removeEventListener("resize", hide)
        document.removeEventListener("visibilitychange", hide)
      }
    }
    configure()
    enabled.addEventListener("change", configure)
    return () => { detach(); enabled.removeEventListener("change", configure) }
  }, [])

  return (
    <div ref={areaRef} className="hero-spotlight" style={{ left: inset }} aria-hidden="true">
      <div ref={lightRef} className="hero-spotlight__light" />
    </div>
  )
}
