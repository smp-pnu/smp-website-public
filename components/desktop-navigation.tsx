"use client"

import Link from "next/link"
import { NAV_ITEMS } from "@/lib/site-config"

export function isNavItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ||
    (href === "/network" && ["/alumni", "/members"].includes(pathname))
}

export function DesktopNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="주요 메뉴" className="hidden lg:block">
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
    </nav>
  )
}
