"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, FileText } from "lucide-react"
import { contentHref, formatDate, type ContentItem } from "@/lib/content-model"
import "./research-showcase.css"

export type ShowcaseReport = ContentItem & { cover?: { url: string } }

export function ResearchShowcase({ items, pending = false, error }: {
  items: ShowcaseReport[]
  pending?: boolean
  error?: string
}) {
  const reports = items.slice(0, 3)
  const [selectedId, setSelectedId] = useState<string>()
  const selected = Math.max(0, reports.findIndex(item => item.id === selectedId))
  const active = reports[selected]
  const companyPrefix = active?.company ? `[${active.company}]` : ""
  const headline = companyPrefix && active.title.startsWith(companyPrefix)
    ? active.title.slice(companyPrefix.length).trim() : active?.title
  const section = useRef<HTMLElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!section.current || !("IntersectionObserver" in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setEntered(true)
      observer.disconnect()
    }, { threshold: 0.15 })
    observer.observe(section.current)
    return () => observer.disconnect()
  }, [])

  return <section ref={section} id="latest-research" className="research-showcase" aria-labelledby="showcase-heading" data-entered={entered}>
    <div className="research-showcase__inner">
      <header className="research-showcase__heading">
        <div>
          <p className="research-showcase__eyebrow">SMP RESEARCH</p>
          <h2 id="showcase-heading">기업을 읽고,<br />가치를 발견합니다.</h2>
        </div>
        <p className="research-showcase__intro">산업의 변화에서 기업의 가능성까지.<br />SMP의 시선을 담은 최근 리포트입니다.</p>
      </header>

      {active ? <div className="research-showcase__body">
        <div className="research-showcase__choices" role="group" aria-label="미리 볼 리포트 선택">
          {reports.map((item, index) => <button key={item.id} type="button" aria-controls="showcase-report-detail" aria-pressed={index === selected}
            onClick={() => setSelectedId(item.id)} className="research-showcase__choice">
            <span className="research-showcase__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="research-showcase__choice-name">{item.company || item.title}</span>
            {item.industry && <span className="research-showcase__choice-industry">{item.industry}</span>}
            <ArrowRight size={16} className="research-showcase__choice-arrow" aria-hidden="true" />
          </button>)}
        </div>
        <div className="research-showcase__stage">
          <div className="research-showcase__stack">
            {reports.map((item, index) => {
              const position = (index - selected + reports.length) % reports.length
              return <div key={item.id} className="research-showcase__sheet" data-position={position}
                style={{ "--sheet-order": reports.length - position } as CSSProperties}>
                <ShowcaseCover url={item.cover?.url} />
                {index === selected && <Link href={contentHref(item)} className="research-showcase__cover-link" tabIndex={-1} aria-label={`${item.title} 리포트 읽기`} />}
              </div>
            })}
          </div>
          <p className="research-showcase__caption"><span>{String(selected + 1).padStart(2, "0")}</span><span aria-hidden="true" className="research-showcase__caption-rule" />최근 발간 리포트</p>
        </div>

        <div className="research-showcase__content">
          <div key={active.id} id="showcase-report-detail" className="research-showcase__detail">
            <div className="research-showcase__meta">
              {active.industry && <span>{active.industry}</span>}
              <time dateTime={active.date}>{formatDate(active.date)}</time>
            </div>
            <p className="research-showcase__company">{active.company || "SMP Research"}</p>
            <h3>{headline}</h3>
            <Link href={contentHref(active)} className="research-showcase__read">리포트 읽기<ArrowUpRight size={20} aria-hidden="true" /></Link>
          </div>

          <Link href="/research" className="research-showcase__archive">전체 리포트 보기<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div> : <div className="research-showcase__empty" role={error ? "alert" : "status"}>
        {pending ? <><span className="research-showcase__loading" aria-hidden="true" />최근 리포트를 준비하고 있습니다.</> : error || "공개 리포트를 준비하고 있습니다."}
        {!pending && <Link href="/research">리포트 목록 보기 <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>}
    </div>
  </section>
}

function ShowcaseCover({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  // Only prepared images: this decorative showcase never downloads a PDF.
  return url && !failed ? <img src={url} alt="" width={720} height={1018} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <div className="research-showcase__missing" aria-hidden="true"><FileText size={40} strokeWidth={1} /><span>SMP RESEARCH</span></div>
}
