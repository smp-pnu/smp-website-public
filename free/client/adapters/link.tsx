import { Link as RouterLink } from "react-router"
import type { AnchorHTMLAttributes } from "react"

// Compatibility boundary for the existing presentation components.
export default function Link({ href, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return /^(https?:|mailto:|tel:)/.test(href) || props.download
    ? <a href={href} {...props} /> : <RouterLink to={href} {...props} />
}
