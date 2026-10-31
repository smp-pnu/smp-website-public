import { HomeEntrance } from "@/components/home-motion"

/** Decorative scene dividers. Each effect is isolated for the next design pass. */
export function HomeStatement() {
  return <HomeEntrance className="home-statement">
    <div className="home-statement__track" aria-hidden="true">
      <span>BEYOND</span><span className="home-statement__star">✳</span><span className="home-statement__outline">THE NUMBERS</span>
    </div>
  </HomeEntrance>
}

export function ResearchOrbit() {
  return <div className="research-orbit" aria-hidden="true">
    <span className="research-orbit__ring research-orbit__ring--one" />
    <span className="research-orbit__ring research-orbit__ring--two" />
    <span className="research-orbit__cross">+</span>
    <span className="research-orbit__label">A DIFFERENT<br />PERSPECTIVE.</span>
  </div>
}

export function ActivityGraphic({ index }: { index: number }) {
  return <div className={`activity-graphic activity-graphic--${index}`} aria-hidden="true">
    {index === 0 ? <><i /><i /><i /><i /><i /><i /></> : index === 1 ? <svg viewBox="0 0 280 100" fill="none"><path d="M0 84L32 76L55 83L86 58L114 69L150 35L177 46L212 15L240 24L280 2" stroke="currentColor" strokeWidth="2" /><path d="M0 98H280M0 49H280" stroke="currentColor" opacity=".16" /></svg> : <><i /><i /><i /></>}
  </div>
}
