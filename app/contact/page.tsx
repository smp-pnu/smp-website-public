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
      <div className="mt-12 grid gap-5 md:grid-cols-3 sm:mt-14">
        {channels.map(({ id, label, title, detail, description, href, action, logo, external }) => <a key={id} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} aria-labelledby={`channel-${id}-title channel-${id}-address`} className="paper-panel channel-card group flex min-h-[340px] flex-col p-7 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-[10px] border border-slate-100 bg-white">
              <Image src={`/channel-logos/${logo}`} alt="" width={32} height={32} className="h-8 w-8 object-contain" aria-hidden="true" />
            </span>
            <span className="text-[10px] font-medium tracking-[.17em] text-slate-500">{label}</span>
          </div>
          <h2 id={`channel-${id}-title`} className="mt-7 text-xl font-medium tracking-tight text-slate-950">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
          <p id={`channel-${id}-address`} className="mt-3 break-words text-sm font-medium leading-6 text-slate-800">{detail}</p>
          <div className="mt-auto pt-7">
            <span className="flex min-h-11 items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm font-medium text-slate-800">
              {action}<ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden="true" />
              {external && <span className="sr-only"> (새 창)</span>}
            </span>
          </div>
        </a>)}
      </div>
    </main>
    <SiteFooter />
  </>
}
