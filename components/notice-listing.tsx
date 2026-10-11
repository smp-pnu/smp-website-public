import type { ReactNode } from "react"
import { PageIntro } from "./page-intro"

export function NoticeListing({ children }: { children: ReactNode }) {
  return <main className="notice-content site-page min-h-[75svh] max-w-6xl">
    <PageIntro eyebrow="NEWS & UPDATES" title="NOTICE">SMP의 새로운 소식과 함께 알아둘 이야기.</PageIntro>
    {children}
  </main>
}
