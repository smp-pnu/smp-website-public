import type { Metadata } from "next"
import { ArrowUpRight, Mail, Camera, MessagesSquare } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SITE_CHANNELS } from "@/lib/site-config"

export const metadata: Metadata = { title: "CONTACT | SMP" }

export default function ContactPage() {
  const channels = [
    { label: "EMAIL", name: SITE_CHANNELS.email, href: `mailto:${SITE_CHANNELS.email}`, action: "SEND EMAIL", icon: Mail, external: false },
    { label: "INSTAGRAM", name: "부산대학교 금융투자학회 SMP", detail: "@smp_pnu", href: SITE_CHANNELS.instagram, action: "INSTAGRAM", icon: Camera, external: true },
    { label: "NAVER CAFE", name: "SMP 네이버 카페", detail: "cafe.naver.com/smppnu", href: SITE_CHANNELS.cafe, action: "NAVER CAFE", icon: MessagesSquare, external: true },
  ]
  return <>
    <SiteHeader />
    <main className="relative z-10 min-h-[75svh]">
      <div className="site-page max-w-6xl">
        <PageIntro eyebrow="CONNECT WITH SMP" title="CONTACT">학회 활동과 모집에 관한 문의는 아래 공식 채널로 보내주세요.</PageIntro>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {channels.map(({ label, name, detail, href, action, icon: Icon, external }) => <section key={label} className="paper-panel flex min-h-72 flex-col p-7 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xs font-semibold tracking-[0.16em] text-slate-600">{label}</h2>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50"><Icon className="h-5 w-5 text-sky-800" strokeWidth={1.5} aria-hidden="true" /></span>
            </div>
            <p className="mt-7 break-words text-lg font-medium leading-relaxed text-slate-900">{name}</p>
            {detail && <p className="mt-2 break-words text-sm text-slate-600">{detail}</p>}
            <div className="mt-auto pt-8">
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="paper-link inline-flex min-h-11 w-full items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm font-medium">
                {action}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                {external && <span className="sr-only"> (새 창)</span>}
              </a>
            </div>
          </section>)}
        </div>
      </div>
    </main>
    <SiteFooter />
  </>
}

