import { createRoot } from "react-dom/client"
import { useEffect } from "react"
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration, useLocation } from "react-router"
import { HomeBackground } from "@/components/home-background"
import { NetworkTransition } from "@/components/network-transition"
import "./style.css"
import "@/app/fonts/body-font"
import { updatePageMetadata } from "./seo"
import { observeDownloads } from "@/lib/site-events"
import { installWebAnalytics } from './web-analytics'

const contentRoute=(name:keyof typeof import("./content-routes"))=>async()=>({Component:(await import("./content-routes"))[name]})
function Layout() {
  useEffect(observeDownloads,[])
  useEffect(installWebAnalytics,[])
  const { pathname,search } = useLocation()
  useEffect(() => { document.getElementById("root")?.removeAttribute("data-prerender");if(!/^\/(research|notice)\/[a-f\d-]+$/.test(pathname)) updatePageMetadata(pathname+search) }, [pathname,search])
  return <NetworkTransition><HomeBackground /><Outlet /><ScrollRestoration /></NetworkTransition>
}
const router = createBrowserRouter([{ Component: Layout, errorElement:<main className="min-h-screen p-12 text-white"><h1>화면을 불러오지 못했습니다.</h1><a href="/" className="mt-6 inline-block text-sky-300">홈으로 돌아가기</a></main>, children: [
  { index:true,lazy:async()=>({Component:(await import("@/app/page")).default}) },
  { path:"about",lazy:async()=>({Component:(await import("@/app/about/page")).default}) },
  { path:"curriculum",lazy:async()=>({Component:(await import("@/app/curriculum/page")).default}) },
  { path:"achievements",lazy:async()=>({Component:(await import("@/app/achievements/page")).default}) },
  { path:"recruit",lazy:async()=>({Component:(await import("@/app/recruit/page")).default}) },
  { path:"contact",lazy:async()=>({Component:(await import("@/app/contact/page")).default}) },
  { path:"research",lazy:contentRoute("Research") }, { path:"notice",lazy:contentRoute("Notices") },
  { path:"research/:id",lazy:contentRoute("ResearchDetail") }, { path:"notice/:id",lazy:contentRoute("NoticeDetail") },
  { path:"search",lazy:contentRoute("Search") }, { path:"network",lazy:contentRoute("Network") }, { path:"alumni",lazy:contentRoute("Network") },
  { path:"members",lazy:contentRoute("Members") }, { path:"*",lazy:async()=>({Component:(await import("@/app/not-found")).default}) },
] }])
// Keep the useful server HTML visible while the initial route chunk loads.
// Subsequent navigation also keeps the current page until its code is ready.
const mount=()=>{
  const root=document.getElementById("root")!
  // A crawler or an old open tab can miss a lazy route chunk. Keep the readable
  // HTML and ordinary navigation links instead of replacing them with an error.
  if(router.state.errors && root.hasAttribute("data-prerender") && root.childElementCount>0) return
  createRoot(root).render(<RouterProvider router={router} />)
}
if(router.state.initialized) mount()
else {
  const unsubscribe=router.subscribe(state=>{if(state.initialized){unsubscribe();mount()}})
}
