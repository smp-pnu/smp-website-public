"use client"

import dynamic from "next/dynamic"
import Image from "next/image"
import { useCallback, useState } from "react"

const PdfCanvas = dynamic(() => import("./pdf-canvas"), {
  ssr: false,
  loading: () => null,
})

export type PdfPreview = { url: string; fallbackUrl?: string; width: number; height: number; title: string }

export function PdfViewer(props: { url: string; preview?: PdfPreview }) {
  return <PdfReader key={props.url} {...props} />
}

function PdfReader({ url, preview }: { url: string; preview?: PdfPreview }) {
  const [ready, setReady] = useState(false)
  const [imageUrl, setImageUrl] = useState(preview?.url)
  const showReader = useCallback(() => setReady(true), [])
  const showPreview = useCallback(() => setReady(false), [])
  return <>
    <div className="relative">
      {!ready && <div className="overflow-hidden rounded-lg border border-white/20 bg-slate-950/80">
        <p role="status" className="flex min-h-16 items-center gap-3 border-b border-white/15 px-4 py-3 text-sm text-slate-300">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-sky-300 motion-reduce:animate-none" />
          {imageUrl ? "첫 페이지 미리보기 · PDF 준비 중…" : "PDF를 불러오고 있습니다…"}
        </p>
        <div className="relative bg-slate-800" style={{ aspectRatio: `${preview?.width ?? 595} / ${preview?.height ?? 842}` }}>
          {imageUrl && preview && <Image src={imageUrl} alt={`${preview.title} 첫 페이지 미리보기`}
            width={preview.width} height={preview.height} unoptimized loading="eager" fetchPriority="high"
            className="h-auto w-full" onError={() => setImageUrl(current => current === preview.url ? preview.fallbackUrl : undefined)} />}
        </div>
      </div>}
      <div className={ready ? undefined : "pointer-events-none absolute inset-0 opacity-0"} inert={!ready} aria-hidden={!ready}>
        <PdfCanvas url={url} onReady={showReader} onRetry={showPreview} />
      </div>
    </div>
    <noscript><p className="p-6 text-slate-300">PDF 미리보기를 사용하려면 JavaScript를 켜주세요. 위 다운로드 버튼으로도 파일을 받을 수 있습니다.</p></noscript>
  </>
}
