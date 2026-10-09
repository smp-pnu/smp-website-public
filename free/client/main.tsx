import { createRoot } from "react-dom/client"
import { lazy, Suspense, useEffect } from "react"
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration, useLocation } from "react-router"
import { HomeBackground } from "@/components/home-background"
import { NetworkTransition } from "@/components/network-transition"
import { ScrollReveal } from "@/components/scroll-reveal"
import { ListPage, DetailPage, SearchPage, NetworkPage, Status } from "./content-pages"
import "./style.css"

const Home = lazy(() => import("@/app/page"))
const About = lazy(() => import("@/app/about/page"))
const Curriculum = lazy(() => import("@/app/curriculum/page"))
const Achievements = lazy(() => import("@/app/achievements/page"))
const Recruit = lazy(() => import("@/app/recruit/page"))
const Contact = lazy(() => import("@/app/contact/page"))
const Missing = lazy(() => import("@/app/not-found"))
function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = `${pathname === "/" ? "부산대학교 금융투자학회" : pathname.split("/")[1].toUpperCase()} | SMP` }, [pathname])
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
