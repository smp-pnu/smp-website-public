import { useApi } from "./api"
import type { ContentResult } from "@/lib/notion-model"
import { sortContent } from "@/lib/content-model"
import { ContentRows } from "@/components/content-rows"
import Link from "next/link"
export function LatestResearchSection() {
  const { value, error } = useApi<ContentResult>("/api/catalog/research")
  return <section className="px-6 py-16 sm:py-20"><div className="mx-auto max-w-6xl">
    <div className="text-center"><span className="text-xs font-normal tracking-[0.3em] text-sky-300">RESEARCH REPORT</span><h2 className="mt-4 text-2xl font-medium leading-snug tracking-tight text-white sm:text-3xl">우리가 발견한 기업의 가치를 확인해보세요.</h2><p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">산업과 기업에 대한 분석을 하나의 투자 아이디어로 완성한 SMP의 리포트를 소개합니다.</p></div>
    <div className="mt-12">{value ? <ContentRows items={sortContent(value.items).slice(0, 3)} /> : <p role={error ? "alert" : "status"} className="py-12 text-center text-slate-400">{error?.message ?? "최신 리포트를 불러오는 중입니다."}</p>}</div>
    <div className="mt-10 flex justify-center"><Link href="/research" className="text-sm tracking-wide text-sky-300">VIEW ALL RESEARCH →</Link></div>
  </div></section>
}
