import Link from "next/link"
import { FileText, ArrowRight } from "lucide-react"
import { getContent } from "@/lib/notion"
import { ContentRows } from "@/components/content-list"

export async function LatestResearchSection() {
  const result = await getContent("research")
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="text-xs font-normal tracking-[0.3em] text-sky-300">RESEARCH REPORT</span>
          <h2 className="mt-4 text-2xl font-medium leading-snug tracking-tight text-white sm:text-3xl">
            우리가 발견한 기업의 가치를 확인해보세요.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            산업과 기업에 대한 분석을 하나의 투자 아이디어로 완성한 SMP의 리포트를 소개합니다.
          </p>
        </div>

        {result.items.length ? <div className="mt-12"><ContentRows items={result.items.slice(0, 3)} /></div> : <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 rounded-lg border border-dashed border-white/20 bg-white/5 px-8 py-16 text-center backdrop-blur-sm">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/70">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-base leading-relaxed text-slate-300">{result.state === "error" ? "리포트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." : "공개 리포트를 준비하고 있습니다."}</p>
        </div>}

        <div className="mt-10 flex justify-center">
          <Link
            href="/research"
            className="inline-flex items-center gap-2 text-sm font-normal text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            VIEW ALL RESEARCH
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

