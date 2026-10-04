"use client"

import { useState } from "react"
import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import { ArrowUpRight, Expand, Scan, X, ZoomIn } from "lucide-react"
import { ReportCover, type ReportCoverProps } from "./report-cover"

export function ReportCoverPreview({ href, ...cover }: Omit<ReportCoverProps, "eager"> & { href: string }) {
  const [zoomed, setZoomed] = useState(false)
  return <Dialog.Root onOpenChange={open => { if (open) setZoomed(false) }}>
    <Dialog.Trigger className="research-cover-trigger" aria-label={`${cover.title} 표지 확대`}>
      <Expand aria-hidden="true" size={14} strokeWidth={1.5} />표지 확대
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className="research-preview-backdrop" />
      <Dialog.Popup className="research-preview-popup">
        <header className="research-preview-header">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] tracking-[.18em] text-slate-400">FIRST PAGE</p>
            <Dialog.Title className="line-clamp-2 break-words text-base font-medium text-white">{cover.title}</Dialog.Title>
            <Dialog.Description className="sr-only">리포트 첫 페이지 미리보기입니다. 확대해서 읽거나 리포트 전문을 열 수 있습니다.</Dialog.Description>
          </div>
          <Dialog.Close className="research-preview-close" aria-label="표지 미리보기 닫기">
            <X aria-hidden="true" size={20} strokeWidth={1.5} />
          </Dialog.Close>
        </header>
        <div className="research-preview-body" data-zoomed={zoomed || undefined}>
          <div className="research-preview-paper">
            {/* The portal mounts on demand. Reuse the exact cached image URL;
                opening a Drive cover never downloads its original PDF. */}
            <ReportCover {...cover} eager />
          </div>
        </div>
        <footer className="research-preview-footer">
          <button type="button" className="research-preview-zoom" aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>
            {zoomed ? <Scan aria-hidden="true" size={16} /> : <ZoomIn aria-hidden="true" size={16} />}
            {zoomed ? "한 페이지" : "크게 보기"}
          </button>
          <Link href={href} prefetch={false} className="research-preview-read">리포트 읽기<ArrowUpRight aria-hidden="true" size={16} /></Link>
        </footer>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
