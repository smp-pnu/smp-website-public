import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import type { ComponentType } from "react"
import { HomeBackground } from "../../components/home-background"
import { SiteHeader } from "../../components/site-header"
import { SiteFooter } from "../../components/site-footer"
import { NetworkTransition } from "../../components/network-transition"
import Home from "../../app/page"
import About from "../../app/about/page"
import Curriculum from "../../app/curriculum/page"
import Achievements from "../../app/achievements/page"
import Recruit from "../../app/recruit/page"
import Contact from "../../app/contact/page"
import Missing from "../../app/not-found"
import { staticPages, metadataHtml } from "./metadata"

const components:Record<string,ComponentType>={"/":Home,"/about":About,"/curriculum":Curriculum,"/achievements":Achievements,"/recruit":Recruit,"/contact":Contact,"/404":Missing}
export function prerender(template:string,path:string,shell=false) {
  const Page=components[path],meta=staticPages[path]
  const html=renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><NetworkTransition><HomeBackground />
    {shell?<><SiteHeader /><div id="seo-content" /><SiteFooter /></>:Page?<Page />:<><SiteHeader /><main className="site-page max-w-5xl"><h1 className="text-4xl text-white">{meta.title}</h1><p className="mt-6 text-site-body">{meta.description}</p><p className="mt-6 text-site-muted">명단과 검색 기능은 JavaScript를 켜면 이용할 수 있습니다.</p></main><SiteFooter /></>}
  </NetworkTransition></MemoryRouter>)
  return template.replace(/<!--smp-head-->[\s\S]*?<!--\/smp-head-->/,()=>`<!--smp-head-->${metadataHtml(path)}<!--/smp-head-->`)
    .replace('<div id="root"></div>',()=>`<div id="root" data-prerender>${html}</div>`)
}
