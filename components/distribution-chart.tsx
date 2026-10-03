"use client"
import { useEffect, useRef, useState } from "react"
export function DistributionChart({ items }: { items: { name: string; value: number }[] }) {
  const root = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 })
    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  return <div ref={root} className="space-y-7">{items.map((item, index) => <div key={item.name}>
    <div className="mb-3 flex justify-between text-sm"><span>{item.name}</span><span className="text-sky-200">{item.value}%</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="distribution-fill h-full origin-left rounded-full bg-gradient-to-r from-blue-600 to-sky-200" style={{ width: `${item.value}%`, transform: `scaleX(${visible ? 1 : 0})`, transition: visible ? `transform 1200ms cubic-bezier(.22,1,.36,1) ${index * 100}ms` : "none" }} /></div>
  </div>)}</div>
}
