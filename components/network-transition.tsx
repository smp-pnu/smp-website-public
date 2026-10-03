"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

const TransitionContext = createContext<(href: string) => void>(() => {})

export function NetworkTransition({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const pending = useRef<(() => void) | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    if (!["/network", "/alumni", "/members"].includes(pathname)) return
    router.prefetch("/alumni")
    router.prefetch("/members")
    for (const src of ["/network-yeouido-portrait.jpg", "/pnu-campus-upscaled.png"]) {
      const image = new Image()
      image.src = src
      void image.decode().catch(() => {})
    }
  }, [router, pathname])

  useLayoutEffect(() => {
    const resolve = pending.current
    pending.current = null
    // View transitions pause painting: waiting for animation frames here can stall navigation.
    resolve?.()
  }, [pathname])

  const navigate = (href: string) => {
    if (busy.current || href === pathname) return
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push(href)
      return
    }
    busy.current = true
    document.documentElement.dataset.networkDirection = href === "/members" ? "forward" : "back"
    let timer: ReturnType<typeof setTimeout>
    const transition = document.startViewTransition(() => new Promise<void>(resolve => {
      pending.current = resolve
      timer = setTimeout(resolve, 4000)
      router.push(href)
    }))
    void transition.finished.catch(() => {}).finally(() => {
      clearTimeout(timer)
      pending.current = null
      busy.current = false
      delete document.documentElement.dataset.networkDirection
    })
  }

  return <TransitionContext.Provider value={navigate}>{children}</TransitionContext.Provider>
}

export const useNetworkTransition = () => useContext(TransitionContext)
