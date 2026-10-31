"use client"

import { useEffect, useRef, useState, type CSSProperties, type RefCallback } from "react"
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
  const reports = items
  const [selectedId, setSelectedId] = useState<string>()
  const [pendingId, setPendingId] = useState<string>()
  const [outgoing, setOutgoing] = useState<{ url: string; sequence: number }>()
  const selectionRequest = useRef(0)
  const coverImages = useRef(new Map<string, HTMLImageElement>())
  const selected = Math.max(0, reports.findIndex(item => item.id === selectedId))
  const active = reports[selected]
  const companyPrefix = active?.company ? `[${active.company}]` : ""
  const headline = companyPrefix && active.title.startsWith(companyPrefix)
    ? active.title.slice(companyPrefix.length).trim() : active?.title
  const section = useRef<HTMLElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => () => { selectionRequest.current++ }, [])

  async function selectReport(item: ShowcaseReport) {
    const sequence = ++selectionRequest.current
    setPendingId(undefined)
    if (item.id === active?.id) return
    const image = coverImages.current.get(item.id)
    if (image && !image.complete) {
      setPendingId(item.id)
      // Keep the current paper and its matching link until the next image is
      // ready. No timers, animation queues or additional PDF/data fetches.
      try { await image.decode() } catch { /* The image's fallback remains usable. */ }
      if (sequence !== selectionRequest.current) return
    }
    setPendingId(undefined)
    const previousImage = active && coverImages.current.get(active.id)
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setOutgoing(animate && previousImage?.complete && previousImage.naturalWidth && active.cover?.url
      ? { url: active.cover.url, sequence } : undefined)
    setSelectedId(item.id)
  }

  useEffect(() => {
    if (!section.current) return
    if (!("IntersectionObserver" in window)) { setEntered(true); return }
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
            aria-busy={pendingId === item.id || undefined}
            onClick={() => void selectReport(item)} className="research-showcase__choice">
            <span className="research-showcase__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="research-showcase__choice-name">{item.company || item.title}</span>
            {item.industry && <span className="research-showcase__choice-industry">{item.industry}</span>}
            <ArrowRight size={16} className="research-showcase__choice-arrow" aria-hidden="true" />
          </button>)}
        </div>
        <figure className="research-showcase__stage">
          <div className="research-showcase__cover">
            {reports.map((item, index) => {
              const position = (index - selected + reports.length) % reports.length
              // Keep a small buffer of prepared images, but display exactly
              // one cover. No PDF or additional data requests on selection.
              if (position > 3) return null
              return <div key={item.id} className="research-showcase__page" data-selected={index === selected} aria-hidden={index !== selected}>
                <ShowcaseCover url={item.cover?.url} eager={entered} imageRef={node => {
                  if (node) coverImages.current.set(item.id, node)
                  else coverImages.current.delete(item.id)
                }} />
                {index === selected && <Link href={contentHref(item)} className="research-showcase__cover-link" tabIndex={-1} aria-label={`${item.title} 리포트 읽기`} />}
              </div>
            })}
            {outgoing && <div key={outgoing.sequence} className="research-showcase__outgoing" aria-hidden="true">
              {[0, 1, 2].map(index => <div key={index} className="research-showcase__slice" style={{ "--slice": index } as CSSProperties}>
                <div className="research-showcase__slice-paper" onAnimationEnd={event => {
                  if (event.target !== event.currentTarget) return
                  // Desktop ends on its last strip; mobile uses only one.
                  if (index === 2 || event.animationName === "showcase-mobile-exit") {
                    setOutgoing(current => current?.sequence === outgoing.sequence ? undefined : current)
                  }
                }}><img src={outgoing.url} alt="" width={720} height={1018} decoding="async" /></div>
              </div>)}
            </div>}
          </div>
          <figcaption className="research-showcase__caption"><span>{[active.semester, active.category || "리포트"].filter(Boolean).join(" · ")}</span><span>{String(selected + 1).padStart(2, "0")} <span className="research-showcase__caption-total">/ {String(reports.length).padStart(2, "0")}</span></span></figcaption>
        </figure>

        <div className="research-showcase__content">
          <div key={active.id} id="showcase-report-detail" className="research-showcase__detail">
            <div className="research-showcase__meta">
              {active.industry && <span>{active.industry}</span>}
              <time dateTime={active.date}>{formatDate(active.date)} 발간</time>
            </div>
            <p className="research-showcase__company">{active.company || "SMP Research"}</p>
            <h3><span className="research-showcase__title-line">{headline}</span></h3>
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

function ShowcaseCover({ url, eager, imageRef }: { url?: string; eager: boolean; imageRef: RefCallback<HTMLImageElement> }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  // Only prepared images: this decorative showcase never downloads a PDF.
  return url && !failed ? <img ref={imageRef} src={url} alt="" width={720} height={1018} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
    : <div className="research-showcase__missing" aria-hidden="true"><FileText size={40} strokeWidth={1} /><span>SMP RESEARCH</span></div>
}
