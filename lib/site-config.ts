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
export const SITE_ORIGIN = "https://pnusmp.com"
export const RESEARCH_CONTEXT = "SMP 학회원이 작성한 학술 연구자료입니다. 분석과 목표주가는 작성 당시의 판단이며 현재 정보와 다를 수 있습니다. 분석 기준일과 근거는 PDF 원문을 확인해주세요."
export const SITE_CHANNELS = {
  email: "smppnu@gmail.com",
  instagram: "https://www.instagram.com/smp_pnu/",
  cafe: "https://cafe.naver.com/smppnu",
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
