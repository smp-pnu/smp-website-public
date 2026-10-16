import { normalizeSearchText, matchesSearchTerms } from "./search-text"

export type SiteSearchEntry = { title: string; text: string; href: string; label: string }

export function siteSearchMatches(entries: SiteSearchEntry[], query: string, limit = Infinity) {
  const terms = normalizeSearchText(query.trim().slice(0, 100)).split(/\s+/).filter(Boolean)
  if (!terms.length || limit <= 0) return []
  const matches: SiteSearchEntry[] = []
  for (const entry of entries) {
    const text = normalizeSearchText(`${entry.title} ${entry.text}`)
    if (!matchesSearchTerms(text, terms)) continue
    matches.push(entry)
    if (matches.length >= limit) break
  }
  return matches
}
