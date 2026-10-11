import type { ReactNode } from "react"
import { PageIntro } from "./page-intro"
import { NetworkTabs } from "./network-tabs"

/** Both network views share exactly the same heading and toggle position. */
export function NetworkLayout({ active, children }: { active: "alumni" | "members"; children: ReactNode }) {
  return <main className="site-page network-page min-h-[75svh] max-w-6xl text-white">
    <div className="network-intro">
      <PageIntro eyebrow="SMP NETWORK" title={<>세대를 잇는 네트워크,<br />함께 성장하는 SMP</>}>
        금융권을 비롯한 다양한 분야에서 활동하는 선배들과 경험과 지식을 나눕니다.<br />
        서울과 부산에서 진행하는 홈커밍데이를 통해 기수 간 교류를 이어갑니다.
      </PageIntro>
    </div>
    <NetworkTabs active={active} />
    <div className="network-content mt-14 sm:mt-20" key={active}>{children}</div>
  </main>
}
