"use client"

import Image from "next/image"
import Link from "next/link"
import { LogoFull } from "@/components/logo"
import { NAV_ITEMS, SITE_NAME_KO } from "@/lib/site-config"
import { cn } from "@/lib/utils"

export function SiteFooter() {

  return (
    <footer
      className={cn(
        "relative z-10 border-t",
        "site-footer-surface border-site-line-soft",
      )}
    >
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-4">
            <Image
              src="/pusan-national-university-logo-transparent.png"
              alt="부산대학교"
              width={2172}
              height={724}
              className="h-12 w-auto max-w-[260px] object-contain object-left brightness-0 invert opacity-85 sm:h-14"
            />
            <LogoFull variant="white" className="h-12 w-auto" />
            <p className="text-sm leading-relaxed text-site-body">
              {SITE_NAME_KO}
            </p>
          </div>

          <nav aria-label="푸터 메뉴">
            <ul className="grid grid-cols-3 gap-x-8 gap-y-3 sm:grid-cols-3">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "text-xs font-normal tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "text-white/70 hover:text-white focus-visible:ring-offset-transparent",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 border-t border-site-line-soft pt-6">
          <p className="text-xs leading-relaxed text-site-muted">
            © {new Date().getFullYear()} {SITE_NAME_KO}. All rights reserved.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-site-muted">Created by SI YEONG KIM</p>
        </div>
      </div>
    </footer>
  )
}

