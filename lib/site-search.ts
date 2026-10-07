import "server-only"
import { getMembers } from "./member-catalog"
import { memberSearchEntries } from "./member-model"
import { awardGroups } from "./awards"
import { getContent } from "./content-catalog"
import { contentHref } from "./content-model"
import type { SiteSearchEntry } from "./site-search-query"

const pages = [
  { title: "ABOUT", text: "SMP 소개 부산대학교 금융투자학회 가치투자 철학 비전 연혁 2006 Research Trading Team", href: "/about" },
  { title: "CURRICULUM", text: "커리큘럼 신입교육 Junior 정규세션 방중세션 Senior Acting Fund 기업분석 투자 교육", href: "/curriculum" },
  { title: "RESEARCH", text: "리서치 보고서", href: "/research" },
  { title: "ACHIEVEMENTS", text: "수상 경력 성과", href: "/achievements" },
  { title: "NETWORK", text: "ALUMNI MEMBERS 선배 회원 멤버 동문 기수", href: "/network" },
  { title: "RECRUIT", text: "모집 지원 RECRUITMENT 41기 지원 자격 일정 회비", href: "/recruit" },
  { title: "NOTICE", text: "공지 공지사항", href: "/notice" },
  { title: "CONTACT", text: "문의 이메일 smppnu@gmail.com 인스타그램 네이버 카페 연락", href: "/contact" },
]
const staticEntries = [...pages, ...awardGroups.flatMap((group, index) => group.awards.map(([title, result]) => ({ title, text: `${group.year} · ${result}`, href: `/achievements#awards-${index}` })))]

// Only explicitly selected public fields enter the browser's search index.
// The catalog already applies publication/date checks and a shared 60s cache.
export async function getSiteSearchIndex() {
  const [research, notices, members] = await Promise.all([getContent("research"), getContent("notice"), getMembers()])
  const content = [research, notices]
  const entries: SiteSearchEntry[] = content.flatMap(result => result.items.map(item => ({
    title: item.title,
    text: [item.category, item.summary, item.author, item.company, item.ticker, item.industry].filter(Boolean).join(" · "),
    href: contentHref(item),
    label: item.kind === "research" ? "리포트" : "공지",
  })))
  entries.push(...memberSearchEntries(members.items), ...staticEntries.map(item => ({ ...item, label: item.href.startsWith("/achievements#") ? "수상" : "페이지" })))
  return { entries, partial: members.state === "error" || content.some(result => result.state === "error") }
}
