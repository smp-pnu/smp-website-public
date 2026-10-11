import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router"
export const usePathname = () => useLocation().pathname
export function useRouter() {
  const navigate = useNavigate()
  return useMemo(() => ({
    push: (href: string, options?: { scroll?: boolean }) => { void navigate(href, { preventScrollReset: options?.scroll === false }) },
    replace: (href: string, options?: { scroll?: boolean }) => { void navigate(href, { replace: true, preventScrollReset: options?.scroll === false }) },
    back: () => { void navigate(-1) },
    prefetch: (_href: string) => {},
  }), [navigate])
}
