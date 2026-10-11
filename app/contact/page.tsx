import type { Metadata } from "next"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SITE_CHANNELS } from "@/lib/site-config"

export const metadata: Metadata = { title: "CONTACT | SMP" }

const channels = [
  { id: "email", label: "EMAIL", title: SITE_CHANNELS.email, description: "학회 활동과 모집에 관한 질문을 보내주세요.", href: `mailto:${SITE_CHANNELS.email}`, action: "메일 보내기", logo: "gmail.svg", external: false },
  { id: "instagram", label: "INSTAGRAM", title: "@smp_pnu", description: "학회 활동과 모집 소식을 사진으로 만나보세요.", href: SITE_CHANNELS.instagram, action: "Instagram 보기", logo: "instagram-color.svg", external: true },
  { id: "cafe", label: "NAVER CAFE", title: "부산대 SMP", description: "공식 카페에서 공지와 학회 자료를 확인하세요.", href: SITE_CHANNELS.cafe, action: "카페 방문하기", logo: "naver-cafe.png", external: true },
]

export default function ContactPage() {
  return <>
    <SiteHeader />
    <main className="site-page min-h-[75svh] max-w-6xl">
      <PageIntro eyebrow="CONNECT WITH SMP" title="CONTACT">학회 활동과 모집에 관한 문의는 아래 공식 채널로 보내주세요.</PageIntro>
      <div className="channel-directory mt-12 grid lg:grid-cols-3 sm:mt-16">
        {channels.map(({ id, label, title, description, href, action, logo, external }) => <a key={id} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} aria-labelledby={`channel-${id}-title`} aria-describedby={external ? `channel-${id}-new-window` : undefined} className="channel-entry group flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-4">
            <Image src={`/channel-logos/${logo}`} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" aria-hidden="true" />
            <p className="editorial-eyebrow">{label}</p>
          </div>
          <h2 id={`channel-${id}-title`} className="mt-7 break-words text-[clamp(1.25rem,2vw,1.5rem)] font-medium tracking-tight text-white">{title}</h2>
          <p className="mt-3 max-w-xs text-sm leading-7 text-site-body">{description}</p>
          <span className="mt-auto flex min-h-11 items-center justify-between gap-3 pt-8 text-sm text-site-accent">
            {action}<ArrowUpRight className="editorial-arrow h-4 w-4" aria-hidden="true" />
            {external && <span id={`channel-${id}-new-window`} className="sr-only">새 창에서 열립니다.</span>}
          </span>
        </a>)}
      </div>
    </main>
    <SiteFooter />
  </>
}
