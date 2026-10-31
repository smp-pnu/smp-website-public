import Link from "next/link"
import { ArrowDown, ArrowUpRight } from "lucide-react"
import { SITE_NAME_KO } from "@/lib/site-config"

export function HeroSection() {
  return <section id="site-hero" className="home-hero" aria-labelledby="home-title">
    <div className="home-hero__grid" aria-hidden="true" />
    <div className="home-hero__inner">
      <div className="home-hero__eyebrow"><span>PUSAN NATIONAL UNIVERSITY</span><span>INVESTMENT RESEARCH</span></div>
      <h1 id="home-title" className="home-hero__title">
        <span className="home-hero__line"><span>STOCK</span></span>
        <span className="home-hero__line home-hero__line--outline"><span>MASTERS</span></span>
        <span className="home-hero__line"><span>OF PNU<span className="home-hero__period">.</span></span></span>
      </h1>
      <a href="#latest-research" className="home-hero__seal" aria-label="최근 리포트 살펴보기">
        <span className="home-hero__seal-orbit" aria-hidden="true"><span /><span /><span /></span>
        <ArrowDown size={40} strokeWidth={1} aria-hidden="true" />
        <span>EXPLORE<br />OUR RESEARCH</span>
      </a>
      <div className="home-hero__bottom">
        <p className="home-hero__description">{SITE_NAME_KO}<br /><span>숫자 너머의 가치를 발견합니다.</span></p>
        <nav aria-label="주요 활동 바로가기" className="home-hero__links">
          <Link href="/research" prefetch={false} className="home-pill home-pill--solid">리포트 보기 <ArrowUpRight size={20} aria-hidden="true" /></Link>
          <Link href="/recruit" prefetch={false} className="home-pill">모집 안내 <ArrowUpRight size={20} aria-hidden="true" /></Link>
        </nav>
      </div>
      <a href="#home-about" className="home-hero__scroll"><span>SCROLL TO DISCOVER</span><ArrowDown size={16} aria-hidden="true" /></a>
    </div>
  </section>
}
