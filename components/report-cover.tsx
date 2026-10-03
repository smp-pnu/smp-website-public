"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { FileText } from "lucide-react"

const PdfCoverCanvas = dynamic(() => import("./pdf-cover-canvas"), { ssr: false })

export function ReportCover({ title, imageUrl, pdfUrl }: { title: string; imageUrl?: string; pdfUrl?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = container.current
    if (!element) return
    if (!("IntersectionObserver" in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: "200px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={container} className="relative aspect-[210/297] overflow-hidden bg-white">
    <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100 px-5 text-center text-slate-400">
      <FileText className="h-9 w-9 stroke-1" />
      <span className="text-xs tracking-wider">{failed ? "표지 미리보기 없음" : imageUrl || pdfUrl ? "PDF REPORT" : "SMP RESEARCH"}</span>
    </div>
    {visible && !failed && imageUrl && <img src={imageUrl} alt={`${title} PDF 첫 페이지`} loading="lazy" decoding="async" width={480} height={679}
      onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-contain" />}
    {visible && !imageUrl && pdfUrl && <PdfCoverCanvas url={pdfUrl} title={title} />}
  </div>
}
