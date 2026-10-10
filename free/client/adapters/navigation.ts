import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router"
export const usePathname = () => useLocation().pathname
export function useRouter() {
  const navigate = useNavigate()
  return useMemo(() => ({
    push: (href: string) => { void navigate(href) },
    replace: (href: string) => { void navigate(href, { replace: true }) },
    back: () => { void navigate(-1) },
    prefetch: (_href: string) => {},
  }), [navigate])
}
