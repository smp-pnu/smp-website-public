export type NavItem = {
  label: string
  href: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: "HOME", href: "/" },
  { label: "ABOUT", href: "/about" },
  { label: "CURRICULUM", href: "/curriculum" },
  { label: "RESEARCH", href: "/research" },
  { label: "ACCOLADES", href: "/achievements" },
  { label: "NETWORK", href: "/network" },
  { label: "RECRUIT", href: "/recruit" },
  { label: "NOTICE", href: "/notice" },
  { label: "CONTACT", href: "/contact" },
]

export const SITE_NAME_KO = "부산대학교 금융투자학회 SMP"
export const SITE_NAME_EN = "STOCK MASTERS OF PNU"
export const SITE_SHORT_NAME_KO = "부산대 SMP"
// Genuine names for the same organization, in preferred fallback order.
export const SITE_ALTERNATE_NAMES = [SITE_SHORT_NAME_KO, "부산대학교 SMP", "SMP", "Stock Masters of PNU"] as const
export const SITE_HOME_TITLE = `${SITE_NAME_KO} | 공식 홈페이지`
export const SITE_DESCRIPTION = `${SITE_NAME_KO} 공식 홈페이지. ${SITE_SHORT_NAME_KO}의 투자 동아리 활동, 기업분석 리포트, 가치투자 교육과 모집 안내.`
export const SITE_INTRO = `${SITE_NAME_KO}(Stock Masters of PNU)는 2006년 시작된 부산대 금융 학회입니다. 부산대학교 학생들이 기업·산업 분석과 가치투자를 함께 연구합니다.`
// Shared by the static Cloudflare pages and Next metadata so both describe the same content.
export const SITE_PAGE_METADATA = {
  about: {
    title: "학회 소개·투자 동아리 활동",
    description: "부산대 금융 학회 SMP의 활동을 소개합니다. 2006년부터 이어온 기업·산업 분석, 리포트 발표·토론과 포트폴리오 운용을 알아보세요.",
  },
  curriculum: {
    title: "주식·기업분석·가치투자 교육",
    description: "부산대 SMP의 금융투자 교육 과정입니다. 신입교육부터 정규세션까지 주식·기업분석, 재무 모델링, 리포트 작성과 포트폴리오 운용을 배웁니다.",
  },
  recruit: {
    title: "투자 동아리 신입회원 모집 안내",
    description: "부산대 투자 동아리 SMP의 신입회원 모집 안내입니다. 지원 자격, 모집 일정, 기업분석·가치투자 활동과 선발 절차를 확인하세요.",
  },
} as const
export const SITE_ORIGIN = "https://pnusmp.com"
export const RESEARCH_CONTEXT = "SMP 학회원이 작성한 학술 연구자료입니다. 분석과 목표주가는 작성 당시의 판단이며 현재 정보와 다를 수 있습니다. 분석 기준일과 근거는 PDF 원문을 확인해주세요."
export const SITE_CHANNELS = {
  email: "smppnu@gmail.com",
  instagram: "https://www.instagram.com/smp_pnu/",
  cafe: "https://cafe.naver.com/smppnu",
  youtube: "https://www.youtube.com/channel/UCCj6Ivz5mw2LCqpmldfJyGg",
} as const

/**
 * Path to the HOME page background photo (e.g. "/home-gwangan.jpg"), once a
 * publish-ready high-resolution photo of Gwangan Bridge / Marine City is
 * added to /public. The image is applied as a single fixed layer behind the
 * entire home page (hero through footer). Leave as null to show the dark
 * navy fallback gradient.
 */
export const HOME_BACKGROUND_IMAGE_SRC: string | null = "/backgrounds/home-gwangan-2.webp"

/**
 * object-position focal point for HOME_BACKGROUND_IMAGE_SRC, tuned separately
 * for desktop and mobile framing once a real photo is set.
 */
export const HOME_BACKGROUND_POSITION = {
  desktop: "50% 50%",
  mobile: "32% 50%",
}
