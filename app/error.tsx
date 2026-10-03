"use client"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="relative z-10 mx-auto flex min-h-[80svh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
    <h1 className="text-2xl text-white">콘텐츠를 불러오지 못했습니다.</h1>
    <p className="text-slate-300">잠시 후 다시 시도해주세요.</p>
    <button onClick={reset} className="border border-sky-300/40 px-6 py-3 text-sky-300">다시 시도</button>
    <a href="/" className="text-sm text-slate-300 underline">홈으로 돌아가기</a>
  </main>
}
