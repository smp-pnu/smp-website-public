"use client"

import { useEffect, useRef } from "react"

export function RecruitSteps({ steps }: { steps: string[] }) {
  const root = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const element = root.current!
    const observer = new IntersectionObserver(([entry]) => {
      element.classList.toggle("steps-visible", entry.isIntersecting)
    }, { threshold: 0, rootMargin: "-72px 0px -32px 0px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <ol ref={root} className="mt-7 grid grid-cols-2 gap-6 lg:grid-cols-4">
    {steps.map((step, index) => <li key={step} className="curriculum-step-item relative pt-5" style={{ animationDelay: `${index * 160}ms` }}>
      <div className="curriculum-bar" aria-hidden="true"><span style={{ background: ["#ffffff", "#b5e2ff", "#68baff", "#2589e8"][index], animationDelay: `${index * 160 + 100}ms` }} /></div>
      <span className="text-xs tracking-[0.16em] text-sky-300">STEP 0{index + 1}</span>
      <p className="mt-3 text-base text-white">{step}</p>
    </li>)}
  </ol>
}
