import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
export default function NotFound() {
  return <><SiteHeader /><main className="relative z-10 mx-auto flex min-h-[70svh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center"><h1 className="text-3xl text-white">페이지를 찾을 수 없습니다.</h1><p className="text-slate-300">주소가 변경되었거나 공개되지 않은 글입니다.</p><Link href="/" className="text-sky-300 underline">홈으로 돌아가기</Link></main><SiteFooter /></>
}
