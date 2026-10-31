"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ArrowUpRight, FileText } from "lucide-react"
import { contentHref, formatDate, type ContentItem } from "@/lib/content-model"
import { publicReportAuthor } from "@/lib/research-metadata"
import "./research-showcase.css"

export type ShowcaseReport = ContentItem & { cover?: { url: string } }

export function ResearchShowcase({ items, pending = false, error }: {
  items: ShowcaseReport[]
  pending?: boolean
  error?: string
}) {
  const shelf = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState(0)
  const first = items[0]
  const count = items.length

  useEffect(() => {
    const element = shelf.current
    if (!element) return
    // Native horizontal scrolling, with only a settled counter update. The
    // reports themselves never move through React or start additional requests.
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      const cards = element.children
      const stride = cards.length > 1 ? (cards[1] as HTMLElement).offsetLeft - (cards[0] as HTMLElement).offsetLeft : element.clientWidth
      const next = stride > 0 ? Math.round(element.scrollLeft / stride) : 0
      setPosition(Math.max(0, Math.min(count - 1, next)))
    }
    const onScroll = () => { clearTimeout(timer); timer = setTimeout(update, 80) }
    element.addEventListener("scroll", onScroll, { passive: true })
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : undefined
    observer?.observe(element)
    update()
    return () => { element.removeEventListener("scroll", onScroll); observer?.disconnect(); clearTimeout(timer) }
  }, [count])

  function move(direction: -1 | 1) {
    const element = shelf.current
    if (!element) return
    const cards = element.children
    const stride = cards.length > 1 ? (cards[1] as HTMLElement).offsetLeft - (cards[0] as HTMLElement).offsetLeft : element.clientWidth
    if (stride <= 0) return
    const target = Math.max(0, Math.min(count - 1, position + direction))
    setPosition(target)
    element.scrollTo({ left: target * stride, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
  }

  return <section id="latest-research" className="home-reports" aria-labelledby="home-reports-heading">
    <div className="home-reports__inner">
      <header className="home-reports__heading">
        <p className="home-reports__eyebrow">RESEARCH REPORT</p>
        <h2 id="home-reports-heading">우리가 발견한 기업의 가치를 확인해보세요.</h2>
        <p className="home-reports__description">산업과 기업에 대한 분석을 하나의 투자 아이디어로 완성한 SMP의 리포트를 소개합니다.</p>
      </header>
      {first ? <>
        <div className="home-reports__edition"><span>{first.semester ? `${first.semester.replace("-", "년 ")}학기` : "최신 리포트"}</span><time dateTime={first.date}>{formatDate(first.date)} 발간</time></div>
        <ul ref={shelf} id="home-report-shelf" className="home-reports__shelf" aria-label="최근 리포트">
          {items.map(item => <li key={item.id} className="home-report">
            <Link href={contentHref(item)} prefetch={false} className="home-report__link">
              <div className="home-report__art">
                <div className="home-report__paper"><ShowcaseCover url={item.cover?.url} title={item.title} /></div>
                <span className="home-report__open" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.5} /></span>
              </div>
              <div className="home-report__info">
                <p className="home-report__industry" title={item.industry}>{item.industry || item.category || "SMP Research"}</p>
                <h3 className="home-report__title" title={item.title}>{item.title}</h3>
                <div className="home-report__footer"><span className="home-report__author">{publicReportAuthor(item.author)}</span><span className="home-report__read">리포트 읽기<ArrowUpRight size={14} aria-hidden="true" /></span></div>
              </div>
            </Link>
          </li>)}
        </ul>
      </> : <div className="home-reports__empty" role={error ? "alert" : "status"}>
        <span className="home-reports__placeholder" aria-hidden="true" />
        <p>{pending ? "최신 리포트를 불러오는 중입니다." : error || "공개 리포트를 준비하고 있습니다."}</p>
      </div>}
      <div className="home-reports__bottom">
        <Link href="/research" className="home-reports__all">기업·산업 분석 리포트 전체 보기<ArrowRight size={16} aria-hidden="true" /></Link>
        {count > 1 && <div className="home-reports__controls" role="group" aria-label="최근 리포트 넘기기">
          <button type="button" aria-label="이전 리포트" aria-controls="home-report-shelf" disabled={position === 0} onClick={() => move(-1)}><ArrowLeft size={16} aria-hidden="true" /></button>
          <span className="home-reports__position" aria-live="polite">{position + 1} / {count}</span>
          <button type="button" aria-label="다음 리포트" aria-controls="home-report-shelf" disabled={position === count - 1} onClick={() => move(1)}><ArrowRight size={16} aria-hidden="true" /></button>
        </div>}
      </div>
    </div>
  </section>
}

function ShowcaseCover({ url, title }: { url?: string; title: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  return url && !failed ? <img src={url} alt={`${title} PDF 첫 페이지`} width={720} height={1018} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <div className="home-report__missing" aria-hidden="true"><FileText size={32} strokeWidth={1} /><span>SMP RESEARCH</span></div>
}
