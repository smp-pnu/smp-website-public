"use client"

import { useState } from "react"
import { Check, Link as LinkIcon } from "lucide-react"

export function CopyReportLink({ href }: { href: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
  return <span className="inline-flex flex-wrap items-center gap-3">
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(new URL(href, window.location.origin).href); setStatus("copied") }
      catch { setStatus("error") }
    }} className="inline-flex min-h-11 items-center gap-2 rounded-[2px] border border-white/20 px-4 text-sm text-slate-200 hover:bg-white/5 focus-visible:outline-sky-300">
      {status === "copied" ? <Check aria-hidden="true" size={15} /> : <LinkIcon aria-hidden="true" size={15} />}링크 복사
    </button>
    <span role="status" className="text-xs text-slate-400">{status === "copied" ? "링크를 복사했습니다." : status === "error" ? "복사가 허용되지 않았습니다. 주소창의 링크를 복사해주세요." : ""}</span>
  </span>
}
