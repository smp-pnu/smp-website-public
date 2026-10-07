import "server-only"
import members from "./members.json"
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
const memberEntries = [...members, { generation: 40, name: "김시영", department: "미디어커뮤니케이션학·경제학" }].map(member => ({
  title: member.name, text: `${member.generation}기 · ${member.department}`, href: `/network?group=${member.generation <= 35 ? "alumni" : "members"}&generation=${member.generation}`,
}))
const staticEntries = [...pages, ...memberEntries, ...awardGroups.flatMap((group, index) => group.awards.map(([title, result]) => ({ title, text: `${group.year} · ${result}`, href: `/achievements#awards-${index}` })))]

// Only explicitly selected public fields enter the browser's search index.
// The catalog already applies publication/date checks and a shared 60s cache.
export async function getSiteSearchIndex() {
  const content = await Promise.all([getContent("research"), getContent("notice")])
  const entries: SiteSearchEntry[] = content.flatMap(result => result.items.map(item => ({
    title: item.title,
    text: [item.category, item.summary, item.author].filter(Boolean).join(" · "),
    href: contentHref(item),
    label: item.kind === "research" ? "리포트" : "공지",
  })))
  entries.push(...staticEntries.map(item => ({ ...item, label: item.href.startsWith("/network?") ? "회원" : item.href.startsWith("/achievements#") ? "수상" : "페이지" })))
  return { entries, partial: content.some(result => result.state === "error") }
}
