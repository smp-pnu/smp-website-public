import type { Metadata } from "next"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import members from "@/lib/members.json"
import { awardGroups } from "@/lib/awards"
import { getContent } from "@/lib/notion"
import { contentHref } from "@/lib/content-model"
export const metadata: Metadata = { title: "SEARCH | SMP" }
export const dynamic = "force-dynamic"

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
const entries = [...pages, ...memberEntries, ...awardGroups.flatMap((group, index) => group.awards.map(([title, result]) => ({ title, text: `${group.year} · ${result}`, href: `/achievements#awards-${index}` })))]
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const raw = (await searchParams).q
  const query = typeof raw === "string" ? raw.trim().slice(0, 100) : ""
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const content = terms.length ? await Promise.all([getContent("notice"), getContent("research")]) : []
  const contentEntries = content.flatMap(result => result.items.map(item => ({ title: item.title, text: `${item.category} · ${item.summary} · ${item.author}`, href: contentHref(item) })))
  const results = terms.length ? [...contentEntries, ...entries].filter(item => terms.every(term => `${item.title} ${item.text}`.toLocaleLowerCase().includes(term))) : []
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-4xl px-6 py-20">
    <h1 className="text-4xl font-light text-white">SEARCH</h1>
    <form action="/search" role="search" className="mt-10 flex gap-3">
      <label htmlFor="search-query" className="sr-only">검색어</label>
      <input key={query} id="search-query" name="q" type="search" maxLength={100} defaultValue={query} placeholder="페이지, 이름, 학과, 수상 내역 검색" className="min-w-0 flex-1 border-b border-white/40 bg-black/25 px-4 py-3 text-white focus:outline-sky-300" />
      <button type="submit" className="px-4 text-sky-300">검색</button>
    </form>
    <p className="mt-8 text-sm text-slate-300">{query ? `“${query}” 검색 결과 ${results.length}건` : "검색어를 입력해주세요."}</p>
    {content.some(result => result.state === "error") && <p role="status" className="mt-3 text-sm text-slate-300">공지·리포트 검색 결과 일부를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>}
    {query && !results.length && <p className="mt-8 text-slate-300">검색 결과가 없습니다. 다른 검색어로 검색해보세요.</p>}
    <ul className="mt-8 divide-y divide-white/20">{results.map((item, index) => <li key={`${item.href}-${index}`} className="py-6"><Link href={item.href} className="block rounded-sm focus-visible:outline-2 focus-visible:outline-sky-300"><h2 className="text-xl font-normal text-white hover:text-sky-300">{item.title}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{item.text}</p></Link></li>)}</ul>
  </main><SiteFooter /></>
}
