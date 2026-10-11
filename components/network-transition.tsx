"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

const TransitionContext = createContext<(href: string) => void>(() => {})

export function NetworkTransition({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const pending = useRef<(() => void) | null>(null)
  const busy = useRef(false)
  const navigation = useRef<{ href: string; x: number; y: number } | null>(null)
  const isNetwork = ["/network", "/alumni", "/members"].includes(pathname)

  useEffect(() => {
    if (!isNetwork) return
    router.prefetch("/alumni")
    router.prefetch("/members")
    for (const src of ["/backgrounds/network-yeouido-portrait.webp", "/backgrounds/pnu-campus-upscaled.webp"]) {
      const image = new Image()
      image.src = window.matchMedia("(max-width: 639px)").matches ? src.replace(".webp", "-mobile.webp") : src
      void image.decode().catch(() => {})
    }
  }, [router, isNetwork])

  useLayoutEffect(() => {
    const resolve = pending.current
    pending.current = null
    const target = navigation.current
    if (target?.href === pathname) {
      // Different-length panels can trigger native scroll anchoring even with scroll: false.
      window.scrollTo({ left: target.x, top: target.y, behavior: "instant" })
      document.querySelector<HTMLAnchorElement>('[data-network-tab][aria-current="page"]')?.focus({ preventScroll: true })
      navigation.current = null
    }
    // View transitions pause painting: waiting for animation frames here can stall navigation.
    resolve?.()
  }, [pathname])

  const navigate = (href: string) => {
    if (busy.current || href === pathname) return
    navigation.current = { href, x: window.scrollX, y: window.scrollY }
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push(href, { scroll: false })
      return
    }
    busy.current = true
    document.documentElement.dataset.networkTransition = ""
    let timer: ReturnType<typeof setTimeout>
    const transition = document.startViewTransition(() => new Promise<void>(resolve => {
      pending.current = resolve
      timer = setTimeout(resolve, 4000)
      router.push(href, { scroll: false })
    }))
    void transition.finished.catch(() => {}).finally(() => {
      clearTimeout(timer)
      pending.current = null
      busy.current = false
      delete document.documentElement.dataset.networkTransition
    })
  }

  return <TransitionContext.Provider value={navigate}>{children}</TransitionContext.Provider>
}

export const useNetworkTransition = () => useContext(TransitionContext)
