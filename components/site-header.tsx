"use client"

import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, X, Search } from "lucide-react"
import { SiteSearchForm } from "@/components/site-search-form"
import { LogoSymbol } from "@/components/logo"
import { NAV_ITEMS } from "@/lib/site-config"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const isHome = pathname === "/"

  return (
    <>
      {/* Non-home pages have no hero to float over, so a spacer keeps content
          clear of the fixed header. The home page hero intentionally starts
          at the very top, behind the header. */}
      {!isHome && <div className="h-18" aria-hidden="true" />}
      <header
      style={{ viewTransitionName: "site-header" }}
      className="site-header-surface fixed inset-x-0 top-0 z-50 border-b border-site-line-soft"
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
                    className="site-nav-link inline-flex min-h-11 items-center text-xs tracking-[0.14em]"
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
            "inline-flex h-11 w-11 items-center justify-center rounded-[4px] transition-colors hover:bg-white/5 lg:hidden focus-visible:outline-2 focus-visible:outline-site-accent",
            "text-white",
          )}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
        <button type="button" aria-label={searchOpen ? "검색 닫기" : "검색 열기"} aria-expanded={searchOpen} aria-controls="site-search" onClick={() => { setSearchOpen(v => !v); setOpen(false) }} className="inline-flex h-11 w-11 items-center justify-center rounded-[4px] text-site-body transition-colors hover:bg-white/5 hover:text-white aria-expanded:bg-white/10 aria-expanded:text-white focus-visible:outline-2 focus-visible:outline-site-accent">
          {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </button>
        </div>
      </div>
      {searchOpen && <div id="site-search" className="max-h-[calc(100svh-4.5rem)] overflow-y-auto overscroll-contain border-t border-site-line-soft bg-site-surface px-6 py-6 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.6)] sm:py-8" onKeyDown={event => { if (event.key === "Escape") { setSearchOpen(false); document.querySelector<HTMLButtonElement>('button[aria-controls="site-search"]')?.focus() } }}>
        <SiteSearchForm onNavigate={() => setSearchOpen(false)} />
      </div>}

      {open && (
        <nav
          id="mobile-nav"
          aria-label="모바일 메뉴"
          className={cn(
            "border-t lg:hidden",
            "border-site-line-soft bg-site-surface",
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
                    className="site-nav-link block py-3 text-sm tracking-[0.1em]"
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

