export type SiteSearchEntry = { title: string; text: string; href: string; label: string }

export function siteSearchMatches(entries: SiteSearchEntry[], query: string, limit = Infinity) {
  const terms = query.trim().slice(0, 100).toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length || limit <= 0) return []
  const matches: SiteSearchEntry[] = []
  for (const entry of entries) {
    const text = `${entry.title} ${entry.text}`.toLocaleLowerCase()
    if (!terms.every(term => text.includes(term))) continue
    matches.push(entry)
    if (matches.length >= limit) break
  }
  return matches
}
