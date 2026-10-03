"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, X, Search } from "lucide-react"
import { LogoSymbol } from "@/components/logo"
import { NAV_ITEMS } from "@/lib/site-config"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pastHero, setPastHero] = useState(false)

  const isHome = pathname === "/"
  // HOME shares one fixed background photo across every section, so the
  // header stays on the light-on-dark treatment the whole time it's on that
  // page — only the background solidity behind it changes on scroll.
  const transparent = isHome && !pastHero

  useEffect(() => {
    if (!isHome) return

    const hero = document.getElementById("site-hero")
    if (!hero) return

    setPastHero(false)
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [isHome])

  return (
    <>
      {/* Non-home pages have no hero to float over, so a spacer keeps content
          clear of the fixed header. The home page hero intentionally starts
          at the very top, behind the header. */}
      {!isHome && <div className="h-18" aria-hidden="true" />}
      <header
      style={{ viewTransitionName: "site-header" }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        isHome
          ? transparent
            ? "border-b border-white/10 bg-transparent"
            : "border-b border-white/10 bg-[#050c18]/75 backdrop-blur-sm"
          : "border-b border-white/10 bg-black/40 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="SMP 홈으로 이동">
          <LogoSymbol variant="white" className="h-8 w-auto sm:h-9" />
        </Link>

        <nav aria-label="주요 메뉴" className="hidden lg:block">
          <ul className="flex items-center gap-4 xl:gap-6">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href === "/network" && ["/alumni", "/members"].includes(pathname))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "text-xs font-normal tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isHome
                        ? cn("text-white/80 hover:text-white focus-visible:ring-offset-transparent", active && "text-white")
                        : cn(
                            "text-white/80 hover:text-white focus-visible:ring-offset-transparent",
                            active && "text-white",
                          ),
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setSearchOpen(false) }}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-md lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "text-white",
          )}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button type="button" aria-label={searchOpen ? "검색 닫기" : "검색 열기"} aria-expanded={searchOpen} aria-controls="site-search" onClick={() => { setSearchOpen(v => !v); setOpen(false) }} className="inline-flex h-10 w-10 items-center justify-center text-white focus-visible:outline-2 focus-visible:outline-sky-300">
          {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </button>
        </div>
      </div>
      {searchOpen && <div id="site-search" className="border-t border-white/10 bg-[#050c18]/95 px-6 py-6" onKeyDown={event => { if (event.key === "Escape") { setSearchOpen(false); document.querySelector<HTMLButtonElement>('button[aria-controls="site-search"]')?.focus() } }}>
        <form action="/search" role="search" className="mx-auto flex max-w-3xl gap-3">
          <label htmlFor="header-query" className="sr-only">사이트 검색</label>
          <input autoFocus id="header-query" name="q" type="search" required maxLength={100} placeholder="페이지, 이름, 학과, 수상 내역 검색" className="min-w-0 flex-1 border-b border-white/40 bg-transparent px-2 py-3 text-white outline-none focus:border-sky-300" />
          <button className="px-4 text-sm text-sky-300" type="submit">검색</button>
        </form>
      </div>}

      {open && (
        <nav
          id="mobile-nav"
          aria-label="모바일 메뉴"
          className={cn(
            "border-t lg:hidden",
            "border-white/10 bg-[#050c18]/95 backdrop-blur-sm",
          )}
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-6 py-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href === "/network" && ["/alumni", "/members"].includes(pathname))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block py-3 text-sm font-normal tracking-[0.1em] transition-colors",
                      isHome
                        ? cn("text-white/80 hover:text-white", active && "text-white")
                        : cn("text-white/80 hover:text-white", active && "text-white"),
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
      </header>
    </>
  )
}

