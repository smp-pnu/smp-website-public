import { normalizeSearchText, matchesSearchTerms } from "./search-text"
import { internalHref } from "./internal-href"

export type SiteSearchEntry = { title: string; text: string; href: string; label: string }

export function siteSearchMatches(entries: SiteSearchEntry[], query: string, limit = Infinity) {
  const terms = normalizeSearchText(query.trim().slice(0, 100)).split(/\s+/).filter(Boolean)
  if (!terms.length || limit <= 0) return []
  const matches: SiteSearchEntry[] = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const href = internalHref(entry?.href)
    if (!href || typeof entry.title !== "string" || typeof entry.text !== "string" || typeof entry.label !== "string") continue
    const text = normalizeSearchText(`${entry.title} ${entry.text}`)
    if (!matchesSearchTerms(text, terms)) continue
    matches.push({ ...entry, href })
    if (matches.length >= limit) break
  }
  return matches
}
