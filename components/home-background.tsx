"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { HOME_BACKGROUND_IMAGE_SRC, HOME_BACKGROUND_POSITION } from "@/lib/site-config"
import { useEffect, useRef, type CSSProperties } from "react"

/**
 * Fixed photo rendered once in the root layout and preserved across routes.
 */
export function HomeBackground() {
  const pathname = usePathname()
  const background = useRef<HTMLDivElement>(null)
  const isAlumni = ["/network", "/alumni"].includes(pathname)
  useEffect(() => {
    if (!isAlumni) return
    let frame = 0
    let current = 0
    let target = 0
    let previous = 0
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const draw = (time: number) => {
      const dt = previous ? Math.min(time - previous, 64) : 16
      previous = time
      current = reduced.matches ? target : current + (target - current) * (1 - Math.exp(-dt / 180))
      background.current?.style.setProperty("--alumni-photo-y", `${current * 100}%`)
      frame = Math.abs(current - target) > .0001 ? requestAnimationFrame(draw) : 0
      if (!frame) previous = 0
    }
    const update = () => {
      target = Math.min(1, Math.max(0, window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)))
      if (!frame) frame = requestAnimationFrame(draw)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update) }
  }, [isAlumni])
  const isHome = pathname === "/"
  const isResearch = pathname === "/research" || pathname.startsWith("/research/")
  const isNotice = pathname === "/notice" || pathname.startsWith("/notice/")
  const photo = isResearch ? "/backgrounds/research-desk.webp" : pathname === "/achievements" ? "/backgrounds/achievements-building.webp" : pathname === "/members" ? "/backgrounds/pnu-campus-upscaled.webp" : ["/network", "/alumni"].includes(pathname) ? "/backgrounds/network-yeouido.webp" : pathname === "/recruit" ? "/backgrounds/recruit-bull.webp" : pathname === "/curriculum" ? "/backgrounds/curriculum-skyscrapers.webp" : isHome ? "/backgrounds/home-gwangan-3.webp" : (["/about", "/contact", "/notice"].includes(pathname) || pathname.startsWith("/notice/")) ? "/backgrounds/page-gwangan-3.webp" : HOME_BACKGROUND_IMAGE_SRC
  return (
    <div ref={background} className="pointer-events-none fixed inset-0 z-0 bg-[#0a1424]" aria-hidden="true">
      {photo ? (
        <Image
          key={photo}
          src={isAlumni ? "/backgrounds/network-yeouido-portrait.webp" : photo}
          alt=""
          fill
          priority
          sizes="100vw"
          className="home-background-photo object-cover"
          style={{ ...(isAlumni ? { objectPosition: "center var(--alumni-photo-y, 0%)" } : {}), "--photo-mobile": HOME_BACKGROUND_POSITION.mobile, "--photo-desktop": HOME_BACKGROUND_POSITION.desktop } as CSSProperties}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1424] via-[#0f2038] to-[#0a1424]" />
      )}
      {/* One neutral black overlay shared across the entire home page. */}
      {!isHome && <div className={`absolute inset-0 ${pathname === "/research" ? "bg-[#080b10]/95" : isNotice ? "bg-black/90" : pathname === "/recruit" ? "bg-black/65" : "bg-black/70"}`} />}
    </div>
  )
}

