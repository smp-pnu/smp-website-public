import { createRoot } from "react-dom/client"
import { lazy, Suspense, useEffect } from "react"
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration, useLocation } from "react-router"
import { HomeBackground } from "@/components/home-background"
import { NetworkTransition } from "@/components/network-transition"
import { ScrollReveal } from "@/components/scroll-reveal"
import { ListPage, DetailPage, SearchPage, NetworkPage, Status } from "./content-pages"
import "./style.css"
import "@/app/fonts/body-font"

const Home = lazy(() => import("@/app/page"))
const About = lazy(() => import("@/app/about/page"))
const Curriculum = lazy(() => import("@/app/curriculum/page"))
const Achievements = lazy(() => import("@/app/achievements/page"))
const Recruit = lazy(() => import("@/app/recruit/page"))
const Contact = lazy(() => import("@/app/contact/page"))
const Missing = lazy(() => import("@/app/not-found"))
const pageTitles: Record<string, string> = {
  about: "학회 소개", curriculum: "커리큘럼", achievements: "활동 성과",
  recruit: "모집 안내", contact: "문의", research: "리포트", notice: "공지사항",
  search: "검색", network: "학회원", alumni: "동문", members: "학회원",
}
function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = pathname === "/" ? "SMP | 부산대학교 금융투자학회" : `SMP · ${pageTitles[pathname.split("/")[1]] ?? "페이지를 찾을 수 없습니다"}` }, [pathname])
  return <NetworkTransition><HomeBackground /><ScrollReveal /><Suspense fallback={<Status />}><Outlet /></Suspense><ScrollRestoration /></NetworkTransition>
}
const router = createBrowserRouter([{ Component: Layout, errorElement:<main className="min-h-screen p-12 text-white"><h1>화면을 불러오지 못했습니다.</h1><a href="/" className="mt-6 inline-block text-sky-300">홈으로 돌아가기</a></main>, children: [
  { index: true, element: <Home /> }, { path: "about", element: <About /> }, { path: "curriculum", element: <Curriculum /> },
  { path: "achievements", element: <Achievements /> }, { path: "recruit", element: <Recruit /> }, { path: "contact", element: <Contact /> },
  { path: "research", element: <ListPage kind="research" /> }, { path: "notice", element: <ListPage kind="notice" /> },
  { path: "research/:id", element: <DetailPage kind="research" /> }, { path: "notice/:id", element: <DetailPage kind="notice" /> },
  { path: "search", element: <SearchPage /> }, { path: "network", element: <NetworkPage /> }, { path: "alumni", element: <NetworkPage /> },
  { path: "members", element: <NetworkPage members /> }, { path: "*", element: <Missing /> },
] }])
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />)
