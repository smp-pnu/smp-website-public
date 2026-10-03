import type { Metadata } from "next"
import { ArrowUpRight, Mail, Camera, MessagesSquare } from "lucide-react"
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
    <main className="relative z-10 min-h-[75svh] bg-black/30">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <h1 className="text-xs font-normal tracking-[0.3em] text-sky-300">CONTACT</h1>
        <p className="mt-5 text-base leading-loose text-slate-300 sm:text-lg">학회 활동과 모집에 관한 문의는 아래 공식 채널로 보내주세요.</p>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {channels.map(({ label, name, detail, href, action, icon: Icon, external }) => <section key={label} className="flex flex-col border-t border-white/25 pt-7">
            <Icon className="h-6 w-6 text-sky-300" strokeWidth={1.25} aria-hidden="true" />
            <h3 className="mt-5 text-xs font-normal tracking-[0.2em] text-sky-300">{label}</h3>
            <p className="mt-4 break-words text-lg leading-relaxed text-white">{name}</p>
            {detail && <p className="mt-2 text-sm text-slate-400">{detail}</p>}
            <div className="mt-auto pt-8">
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="inline-flex items-center gap-2 text-sm text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-300">
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

