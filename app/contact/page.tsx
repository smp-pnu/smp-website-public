import type { Metadata } from "next"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SITE_CHANNELS } from "@/lib/site-config"

export const metadata: Metadata = { title: "CONTACT | SMP" }

const channels = [
  { id: "email", label: "EMAIL", title: "이메일 문의", detail: SITE_CHANNELS.email, description: "학회 활동과 모집에 관한 질문을 보내주세요.", href: `mailto:${SITE_CHANNELS.email}`, action: "메일 보내기", logo: "gmail.svg", external: false },
  { id: "instagram", label: "INSTAGRAM", title: "Instagram", detail: "@smp_pnu", description: "학회 활동과 모집 소식을 사진으로 만나보세요.", href: SITE_CHANNELS.instagram, action: "Instagram 보기", logo: "instagram.svg", external: true },
  { id: "cafe", label: "NAVER CAFE", title: "네이버 카페", detail: "cafe.naver.com/smppnu", description: "공식 카페에서 공지와 학회 자료를 확인하세요.", href: SITE_CHANNELS.cafe, action: "카페 방문하기", logo: "naver-cafe.png", external: true },
]

export default function ContactPage() {
  return <>
    <SiteHeader />
    <main className="site-page min-h-[75svh] max-w-6xl">
      <PageIntro eyebrow="CONNECT WITH SMP" title="CONTACT">학회 활동과 모집에 관한 문의는 아래 공식 채널로 보내주세요.</PageIntro>
      <div className="mt-12 grid gap-4 lg:grid-cols-3 sm:mt-14 sm:gap-5">
        {channels.map(({ id, label, title, detail, description, href, action, logo, external }) => <a key={id} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} aria-labelledby={`channel-${id}-title channel-${id}-address`} aria-describedby={external ? `channel-${id}-new-window` : undefined} className="paper-panel channel-card group flex min-w-0 flex-col overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <Image src={`/channel-logos/${logo}`} alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" aria-hidden="true" />
              <div>
                <p className="paper-eyebrow">{label}</p>
                <h2 id={`channel-${id}-title`} className="paper-section-title mt-1">{title}</h2>
              </div>
            </div>
            <p className="mt-6 text-[15px] leading-7 paper-copy">{description}</p>
            <p id={`channel-${id}-address`} className="mt-3 break-words text-sm font-medium leading-6 paper-copy">{detail}</p>
          </div>
          <span className="paper-panel-footer mt-auto flex min-h-[68px] items-center justify-between gap-3 px-6 py-4 text-sm font-medium paper-copy sm:px-8">
            {action}<ArrowUpRight className="paper-action-arrow h-4 w-4" aria-hidden="true" />
            {external && <span id={`channel-${id}-new-window`} className="sr-only">새 창에서 열립니다.</span>}
          </span>
        </a>)}
      </div>
    </main>
    <SiteFooter />
  </>
}
