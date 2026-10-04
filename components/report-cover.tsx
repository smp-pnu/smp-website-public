"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { FileText } from "lucide-react"

const PdfCoverCanvas = dynamic(() => import("./pdf-cover-canvas"), { ssr: false })

export type ReportCoverProps = {
  title: string; imageUrl?: string; fallbackUrl?: string; pdfUrl?: string; eager?: boolean
}

export function ReportCover({ title, imageUrl, fallbackUrl, pdfUrl, eager = false }: ReportCoverProps) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  const [failed, setFailed] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  useEffect(() => {
    const element = container.current
    if (!element || eager) return
    if (!("IntersectionObserver" in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: "200px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [eager])
  return <div ref={container} className="relative aspect-[210/297] overflow-hidden bg-white">
    <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100 px-5 text-center text-slate-400">
      <FileText className="h-9 w-9 stroke-1" />
      <span className="text-xs tracking-wider">{failed ? "표지 미리보기 없음" : imageUrl || pdfUrl ? "PDF REPORT" : "SMP RESEARCH"}</span>
    </div>
    {visible && !failed && imageUrl && <Image src={useFallback ? fallbackUrl! : imageUrl} alt={`${title} PDF 첫 페이지`}
      unoptimized loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" width={720} height={1018}
      onError={() => fallbackUrl && !useFallback ? setUseFallback(true) : setFailed(true)} className="absolute inset-0 h-full w-full object-contain" />}
    {visible && !imageUrl && pdfUrl && <PdfCoverCanvas url={pdfUrl} title={title} />}
  </div>
}
