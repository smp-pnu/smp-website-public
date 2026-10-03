const STEPS = ["UNDERSTAND", "ANALYZE", "DISCUSS", "INVEST"]

export function ProcessSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="text-xs font-normal tracking-[0.3em] text-sky-300">OUR PROCESS</span>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-medium leading-snug tracking-tight text-white sm:text-3xl">
            FROM RESEARCH TO INVESTMENT
          </h2>
        </div>

        <ol className="mt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-3 sm:gap-4">
              <span className="px-2 py-2 text-sm font-normal tracking-[0.15em] text-white sm:text-base">
                {label}
              </span>
              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className="text-white/40">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base leading-relaxed text-slate-300 sm:text-lg">
          시장을 이해하고, 기업을 분석합니다. 발표와 토론으로 투자 논리를 다듬고,
          <br />
          실제 투자에서 그 판단을 검증합니다.
        </p>
      </div>
    </section>
  )
}

