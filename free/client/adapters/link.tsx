import { Link as RouterLink } from "react-router"
import type { AnchorHTMLAttributes } from "react"

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  prefetch?: boolean
  onNavigate?: (event: { preventDefault: () => void }) => void
}

// Compatibility boundary for the existing presentation components.
export default function Link({ href, prefetch: _prefetch, onNavigate, onClick, ...props }: LinkProps) {
  return /^(https?:|mailto:|tel:)/.test(href) || props.download
    ? <a href={href} onClick={onClick} {...props} /> : <RouterLink to={href} {...props} onClick={event => {
      onClick?.(event)
      // Match Next's navigation hook: modified/new-tab clicks retain native behavior.
      if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (!props.target || props.target === "_self")) {
        onNavigate?.({ preventDefault: () => event.preventDefault() })
      }
    }} />
}
