import { awardGroups } from "./awards"
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
export const staticEntries = [...pages, ...awardGroups.flatMap((group, index) => group.awards.map(([title, result]) => ({ title, text: `${group.year} · ${result}`, href: `/achievements#awards-${index}` })))]
