/** Reconstruct a same-site link; reject protocols, network paths and escapes. */
export function internalHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null
  try {
    const decodedPath = decodeURIComponent(value.split(/[?#]/, 1)[0])
    if (decodedPath.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decodedPath)) return null
    const url = new URL(value, "https://pnusmp.com")
    if (url.origin !== "https://pnusmp.com") return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}
