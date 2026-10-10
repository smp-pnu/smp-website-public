import "server-only"
import { industrySector } from "./wics"
import { getMembers } from "./member-catalog"
import { memberSearchEntries } from "./member-model"
import { staticEntries } from "./site-search-static"
import { getContent } from "./content-catalog"
import { contentHref } from "./content-model"
import type { SiteSearchEntry } from "./site-search-query"


// Only explicitly selected public fields enter the browser's search index.
// The catalog already applies publication/date checks and a shared 60s cache.
export async function getSiteSearchIndex() {
  const [research, notices, members] = await Promise.all([getContent("research"), getContent("notice"), getMembers()])
  const content = [research, notices]
  const entries: SiteSearchEntry[] = content.flatMap(result => result.items.map(item => ({
    title: item.title,
    text: [item.category, item.summary, item.author, item.company, item.ticker, item.industry, industrySector(item.industry)].filter(Boolean).join(" · "),
    href: contentHref(item),
    label: item.kind === "research" ? "리포트" : "공지",
  })))
  entries.push(...memberSearchEntries(members.items), ...staticEntries.map(item => ({ ...item, label: item.href.startsWith("/achievements#") ? "수상" : "페이지" })))
  return { entries, partial: members.state === "error" || content.some(result => result.state === "error") }
}
