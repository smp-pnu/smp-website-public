/** Reconstruct a same-site link; reject protocols, network paths and escapes. */
export function internalHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null
  try {
    const decodedPath = decodeURIComponent(value.split(/[?#]/, 1)[0])
    if (decodedPath.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decodedPath)) return null
    const url = new URL(value, "https://pnusmp.com")
    if (url.origin !== "https://pnusmp.com" || url.pathname.startsWith("//")) return null
    // Encode each component after parsing, preserving separators only where
    // they belong. DOM/bootstrap data never reaches a link as raw markup.
    const path = url.pathname.split("/").map(part => encodeURIComponent(decodeURIComponent(part))).join("/")
    const query = Array.from(url.searchParams, ([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`).join("&")
    const hash = url.hash ? `#${encodeURIComponent(decodeURIComponent(url.hash.slice(1)))}` : ""
    return `${path}${query ? `?${query}` : ""}${hash}`
  } catch { return null }
}
