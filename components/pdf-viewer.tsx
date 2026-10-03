"use client"

import dynamic from "next/dynamic"

const PdfCanvas = dynamic(() => import("./pdf-canvas"), {
  ssr: false,
  loading: () => <p role="status" className="p-6 text-sm text-slate-300">PDF 뷰어를 준비하고 있습니다…</p>,
})

export function PdfViewer({ url }: { url: string }) {
  return <><PdfCanvas key={url} url={url} /><noscript><p className="p-6 text-slate-300">PDF 미리보기를 사용하려면 JavaScript를 켜주세요. 위 다운로드 버튼으로도 파일을 받을 수 있습니다.</p></noscript></>
}
