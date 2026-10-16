"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { NAV_ITEMS } from "@/lib/site-config"

export function isNavItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ||
    (href === "/network" && ["/alumni", "/members"].includes(pathname))
}

export function DesktopNavigation({ pathname }: { pathname: string }) {
  const navRef = useRef<HTMLElement>(null)
  const lineRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const nav = navRef.current
    const line = lineRef.current
    if (!nav || !line) return
    const desktop = window.matchMedia("(min-width: 1024px)")
    let detach = () => {}

    const configure = () => {
      detach()
      if (!desktop.matches) return
      let hovered: HTMLAnchorElement | null = null
      let frame = 0
      const linkFrom = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLAnchorElement>("a.site-nav-link") : null
      const refresh = () => {
        frame = 0
        const focused = linkFrom(document.activeElement)
        const target = focused && nav.contains(focused) && focused.matches(":focus-visible") ? focused :
          hovered ?? nav.querySelector<HTMLAnchorElement>('[aria-current="page"]')
        if (!target) { line.style.opacity = "0"; return }
        const bounds = nav.getBoundingClientRect()
        const link = target.getBoundingClientRect()
        line.style.transform = `translateX(${link.left - bounds.left}px) scaleX(${link.width})`
        line.style.opacity = "1"
        nav.dataset.indicatorReady = ""
      }
      const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh) }
      const enter = (event: PointerEvent) => {
        if (event.pointerType === "touch") return
        hovered = linkFrom(event.target)
        schedule()
      }
      const leave = () => { hovered = null; schedule() }
      nav.addEventListener("pointerover", enter)
      nav.addEventListener("pointerleave", leave)
      nav.addEventListener("focusin", schedule)
      nav.addEventListener("focusout", schedule)
      const observer = new ResizeObserver(schedule)
      observer.observe(nav)
      refresh()
      detach = () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        nav.removeEventListener("pointerover", enter)
        nav.removeEventListener("pointerleave", leave)
        nav.removeEventListener("focusin", schedule)
        nav.removeEventListener("focusout", schedule)
      }
    }
    configure()
    desktop.addEventListener("change", configure)
    return () => { detach(); desktop.removeEventListener("change", configure) }
  }, [pathname])

  return (
    <nav ref={navRef} aria-label="주요 메뉴" className="site-desktop-nav hidden lg:block">
      <ul className="flex items-center gap-4 xl:gap-6">
        {NAV_ITEMS.map(item => (
          <li key={item.href}>
            <Link href={item.href} aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined}
              className="site-nav-link inline-flex min-h-11 items-center text-xs tracking-[0.14em]">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <span ref={lineRef} className="site-nav-indicator" aria-hidden="true" />
    </nav>
  )
}
