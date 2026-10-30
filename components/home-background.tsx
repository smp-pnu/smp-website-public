"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { HOME_BACKGROUND_IMAGE_SRC, HOME_BACKGROUND_POSITION } from "@/lib/site-config"
import { useEffect, useRef, type CSSProperties } from "react"

/** Fixed photo rendered once in the root layout and preserved across routes. */
export function HomeBackground() {
  const pathname = usePathname()
  const background = useRef<HTMLDivElement>(null)
  const isAlumni = ["/network", "/alumni"].includes(pathname)
  const scrollPhotoRatio = isAlumni ? 1.25 : pathname === "/curriculum" ? 4 / 3 : undefined

  useEffect(() => {
    const layer = background.current
    const photo = layer?.querySelector("img")
    if (!scrollPhotoRatio || !layer || !photo) return

    let frame = 0
    let current = 0
    let target = 0
    let previous = 0
    let travel = 0
    let scrollRange = 1
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const paint = () => layer.style.setProperty("--photo-offset", `${-current * travel}px`)
    const draw = (time: number) => {
      const dt = previous ? Math.min(time - previous, 64) : 16
      previous = time
      current += (target - current) * (1 - Math.exp(-dt / 180))
      const settled = Math.abs(current - target) * travel < .1
      if (settled) current = target
      paint()
      frame = settled ? 0 : requestAnimationFrame(draw)
      if (!frame) previous = 0
    }
    const update = () => {
      if (reduced.matches) return
      target = Math.min(1, Math.max(0, window.scrollY / scrollRange))
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const measure = () => {
      // Read layout only when its dimensions change, never on every scroll frame.
      travel = Math.max(0, photo.offsetHeight - layer.clientHeight)
      scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      current = target = reduced.matches ? 0 : Math.min(1, Math.max(0, window.scrollY / scrollRange))
      cancelAnimationFrame(frame)
      frame = previous = 0
      paint()
    }
    measure()
    const size = new ResizeObserver(measure)
    size.observe(document.documentElement)
    size.observe(layer)
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", measure)
    reduced.addEventListener("change", measure)
    return () => {
      cancelAnimationFrame(frame)
      size.disconnect()
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", measure)
      reduced.removeEventListener("change", measure)
      layer.style.removeProperty("--photo-offset")
    }
  }, [pathname, scrollPhotoRatio])

  const isHome = pathname === "/"
  const isNotice = pathname === "/notice" || pathname.startsWith("/notice/")
  const isResearch = pathname === "/research" || pathname.startsWith("/research/")
  const photo = isResearch ? "/backgrounds/research-desk.webp"
    : pathname === "/achievements" ? "/backgrounds/achievements-building.webp"
    : pathname === "/members" ? "/backgrounds/pnu-campus-upscaled.webp"
    : isAlumni ? "/backgrounds/network-yeouido-portrait.webp"
    : pathname === "/recruit" ? "/backgrounds/recruit-bull.webp"
    : pathname === "/curriculum" ? "/backgrounds/curriculum-skyscrapers-restored.webp"
    : isHome ? "/backgrounds/home-gwangan-3.webp"
    : (["/about", "/contact", "/notice"].includes(pathname) || pathname.startsWith("/notice/")) ? "/backgrounds/page-gwangan-3.webp"
    : HOME_BACKGROUND_IMAGE_SRC
  return (
    <div ref={background}
      className={`site-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden ${isHome ? "site-backdrop--hero" : isNotice ? "site-backdrop--notice" : ""}`}
      style={{ viewTransitionName: "site-background" }} aria-hidden="true">
      {photo ? (
        <Image key={photo} src={photo} alt="" fill priority sizes="100vw"
          className="site-photo home-background-photo object-cover"
          style={{
            ...(scrollPhotoRatio ? {
              // Keep a little travel on portrait screens as well as wide desktops.
              height: `max(108%, ${100 * scrollPhotoRatio}vw)`,
              objectPosition: "center top",
              transform: "translate3d(0, var(--photo-offset, 0px), 0)",
              willChange: "transform",
            } : {}),
            "--photo-mobile": HOME_BACKGROUND_POSITION.mobile,
            "--photo-desktop": HOME_BACKGROUND_POSITION.desktop,
          } as CSSProperties}
        />
      ) : <div className="absolute inset-0 bg-site-background" />}
    </div>
  )
}
