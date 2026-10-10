import type { Metadata } from "next"
import { ArrowUpRight, Mail, Camera, MessagesSquare } from "lucide-react"
import { PageIntro } from "@/components/page-intro"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = { title: "CONTACT | SMP" }

export default function ContactPage() {
  const channels = [
    { label: "EMAIL", name: "smppnu@gmail.com", href: "mailto:smppnu@gmail.com", action: "SEND EMAIL", icon: Mail, external: false },
    { label: "INSTAGRAM", name: "부산대학교 금융투자학회 SMP", detail: "@smp_pnu", href: "https://www.instagram.com/smp_pnu/", action: "INSTAGRAM", icon: Camera, external: true },
    { label: "NAVER CAFE", name: "SMP 네이버 카페", detail: "cafe.naver.com/smppnu", href: "https://cafe.naver.com/smppnu", action: "NAVER CAFE", icon: MessagesSquare, external: true },
  ]
  return <>
    <SiteHeader />
    <main className="relative z-10 min-h-[75svh]">
      <div className="site-page max-w-6xl">
        <PageIntro eyebrow="CONNECT WITH SMP" title="CONTACT">학회 활동과 모집에 관한 문의는 아래 공식 채널로 보내주세요.</PageIntro>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {channels.map(({ label, name, detail, href, action, icon: Icon, external }) => <section key={label} className="flex flex-col border-t border-white/25 pt-7">
            <Icon className="h-6 w-6 text-site-accent" strokeWidth={1.25} aria-hidden="true" />
            <h2 className="mt-5 text-xs font-normal tracking-[0.2em] text-site-accent">{label}</h2>
            <p className="mt-4 break-words text-lg leading-relaxed text-white">{name}</p>
            {detail && <p className="mt-2 text-sm text-site-muted">{detail}</p>}
            <div className="mt-auto pt-8">
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="inline-flex items-center gap-2 text-sm text-site-accent transition-colors hover:text-site-accent focus-visible:outline-2 focus-visible:outline-site-accent">
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

