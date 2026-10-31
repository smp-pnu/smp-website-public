"use client"

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ArrowUpRight, FileText } from "lucide-react"
import { contentHref, formatDate, type ContentItem } from "@/lib/content-model"
import { publicReportAuthor } from "@/lib/research-metadata"
import "./research-showcase.css"

export type ShowcaseReport = ContentItem & { cover?: { url: string } }

function companyName(item: ShowcaseReport) {
  return item.company || item.title.match(/^\[([^\]]+)\]/)?.[1] || item.title
}

/** A bounded, click-driven panel reveal. No autoplay, scroll interception or PDF work. */
export function ResearchShowcase({ items, pending = false, error }: {
  items: ShowcaseReport[]
  pending?: boolean
  error?: string
}) {
  const [selectedId, setSelectedId] = useState<string>()
  const index = Math.max(0, items.findIndex(item => item.id === selectedId))
  const active = items[index]
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [direction, setDirection] = useState(1)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  function select(next: number, focus = false) {
    if (next < 0 || next >= items.length) return
    setDirection(next >= index ? 1 : -1)
    setSelectedId(items[next].id)
    if (focus) buttons.current[next]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    const next = event.key === "ArrowRight" ? Math.min(items.length - 1, current + 1)
      : event.key === "ArrowLeft" ? Math.max(0, current - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : undefined
    if (next === undefined) return
    event.preventDefault()
    select(next, true)
  }

  return <section id="latest-research" className="report-exhibit" aria-labelledby="report-exhibit-heading">
    <div className="report-exhibit__inner">
      <header className="report-exhibit__heading">
        <div><p className="report-exhibit__eyebrow">RESEARCH REPORT</p><h2 id="report-exhibit-heading">우리가 발견한 기업의 가치를<br className="report-exhibit__break" /> 확인해보세요.</h2></div>
        <p className="report-exhibit__description">산업과 기업에 대한 분석을<br />하나의 투자 아이디어로.</p>
      </header>
      {active ? <>
        <div className="report-exhibit__edition"><span>{active.semester ? `${active.semester.replace("-", "년 ")}학기` : "최신 리포트"}</span><time dateTime={active.date}>{formatDate(active.date)} 발간</time><span className="report-exhibit__hint">기업을 선택해 리포트를 펼쳐보세요<ArrowUpRight size={14} aria-hidden="true" /></span></div>
        <div className="report-exhibit__selectors" role="group" aria-label="최신 리포트 선택" style={{ "--report-count": items.length } as CSSProperties}>
          {items.map((item, i) => <button key={item.id} ref={node => { buttons.current[i] = node }} type="button" aria-pressed={i === index} aria-controls="report-exhibit-detail" onClick={() => select(i)} onKeyDown={event => onKeyDown(event, i)}>
            <span className="report-exhibit__index">{String(i + 1).padStart(2, "0")}</span><span>{companyName(item)}</span><ArrowUpRight size={16} aria-hidden="true" />
          </button>)}
        </div>
        <div className="report-exhibit__stage" style={{ "--direction": direction } as CSSProperties}
          onTouchStart={event => { swiped.current = false; const point = event.touches[0]; touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null }}
          onTouchEnd={event => {
            const start = touch.current; touch.current = null
            if (!start) return
            const end = event.changedTouches[0]
            const x = end.clientX - start.x, y = end.clientY - start.y
            if (Math.abs(x) > 48 && Math.abs(x) > Math.abs(y) * 1.5) { swiped.current = true; select(index + (x < 0 ? 1 : -1)) }
          }} onTouchCancel={() => { touch.current = null }}>
          {items.map((item, i) => <div key={item.id} className="report-exhibit__panel" data-active={i === index}>
            <span className="report-exhibit__panel-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <div className="report-exhibit__paper"><ShowcaseCover url={item.cover?.url} title={item.title} /></div>
            <span className="report-exhibit__spine" aria-hidden="true"><span>{companyName(item)}</span><ArrowUpRight size={20} /></span>
            {i === index ? <Link href={contentHref(item)} prefetch={false} className="report-exhibit__cover-action" onClick={event => { if (swiped.current) { event.preventDefault(); swiped.current = false } }} aria-label={`${companyName(item)} 리포트 읽기`}><span>리포트 읽기<ArrowUpRight size={16} aria-hidden="true" /></span></Link>
              : <button type="button" tabIndex={-1} className="report-exhibit__panel-action" aria-label={`${companyName(item)} 표지 펼치기`} onClick={() => select(i)} />}
          </div>)}
        </div>
        <div id="report-exhibit-detail" className="report-exhibit__detail" aria-live="polite" aria-atomic="true">
          <div key={active.id} className="report-exhibit__caption">
            <p className="report-exhibit__meta"><span>{active.industry || active.category}</span><span>{publicReportAuthor(active.author)}</span>{active.ticker && <span>{active.ticker}</span>}</p>
            <h3>{active.title}</h3>
          </div>
          <div className="report-exhibit__navigation" role="group" aria-label="리포트 넘기기">
            <button type="button" aria-label="이전 리포트" disabled={index === 0} onClick={() => select(index - 1)}><ArrowLeft size={18} aria-hidden="true" /></button>
            <span>{String(index + 1).padStart(2, "0")}<span> / {String(items.length).padStart(2, "0")}</span></span>
            <button type="button" aria-label="다음 리포트" disabled={index === items.length - 1} onClick={() => select(index + 1)}><ArrowRight size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </> : <div className="report-exhibit__empty" role={error ? "alert" : "status"}><FileText size={32} strokeWidth={1} aria-hidden="true" /><p>{pending ? "최신 리포트를 불러오는 중입니다." : error || "공개 리포트를 준비하고 있습니다."}</p></div>}
      <footer className="report-exhibit__bottom"><span>STOCK MASTERS OF PNU</span><Link href="/research">기업·산업 분석 리포트 전체 보기<ArrowRight size={16} aria-hidden="true" /></Link></footer>
    </div>
  </section>
}

function ShowcaseCover({ url, title }: { url?: string; title: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  return url && !failed ? <img src={url} alt={`${title} PDF 첫 페이지`} width={720} height={1018} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <div className="report-exhibit__missing"><FileText size={32} strokeWidth={1} aria-hidden="true" /><span>SMP RESEARCH</span></div>
}
