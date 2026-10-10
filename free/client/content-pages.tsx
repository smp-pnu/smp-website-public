import { useEffect, useMemo } from "react"
import { Navigate, useLocation, useParams } from "react-router"
import Link from "next/link"
import Form from "next/form"
import { useApi } from "./api"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ContentList } from "@/components/content-list"
import { ResearchDetailHeader } from "@/components/research-detail-header"
import { PdfViewer } from "@/components/pdf-viewer"
import { NotionContent } from "@/components/notion-content"
import { NoticeArticle } from "@/components/notice-article"
import { SiteSearchResults } from "@/components/site-search-results"
import { SearchField } from "@/components/search-field"
import { AlumniOverview } from "@/components/alumni-overview"
import { MembersDirectory } from "@/components/members-directory"
import { NetworkTabs } from "@/components/network-tabs"
import { relatedResearch } from "@/lib/research-metadata"
import { isNotionFileUrl } from "@/lib/pdf-source"
import { contentReturnHref } from "@/lib/content-navigation"
import { contentHref, formatDate, sortContent, type ContentKind } from "@/lib/content-model"
import { sortMembers, type MemberResult } from "@/lib/member-model"
import { getPdfSources, isTrustedAttachmentUrl } from "@/lib/pdf-source"
import type { ContentResult, ContentBlock } from "@/lib/notion-model"
import type { SiteSearchEntry } from "@/lib/site-search-query"
import type { PreparedItem } from "./grid"

function useSearch() { return Object.fromEntries(new URLSearchParams(useLocation().search)) }
export function Status({ error }: { error?: Error }) { return <p role={error ? "alert" : "status"} className="py-20 text-center leading-8 text-slate-300">{error?.message ?? "자료를 불러오는 중입니다."}</p> }
export function ListPage({ kind }: { kind: ContentKind }) {
  const { value, error } = useApi<ContentResult>(`/api/catalog/${kind}`)
  const search = useSearch()
  const result = useMemo(() => value && ({ ...value, items: sortContent(value.items) }), [value])
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-7xl px-6 py-12 sm:py-16">
    <header className="text-center"><p className="text-[11px] tracking-[0.3em] text-sky-200/80">{kind === "research" ? "SMP PUBLICATIONS" : "SMP NOTICE"}</p><h1 className="mt-4 text-4xl font-light tracking-wide text-white sm:text-5xl">{kind === "research" ? "RESEARCH" : "NOTICE"}</h1><p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">{kind === "research" ? "산업과 기업을 분석한 SMP의 투자 리포트입니다." : "SMP의 새로운 소식을 확인하세요."}</p></header>
    {result ? <ContentList result={result} kind={kind} search={search} /> : <Status error={error} />}
  </main><SiteFooter /></>
}

export function DetailPage({ kind }: { kind: ContentKind }) {
  const { id } = useParams()
  const search = useSearch()
  const { value, error } = useApi<{ item: PreparedItem; blocks: ContentBlock[]; bodyPending?: boolean }>(`/api/detail/${kind}/${id}`, 0)
  const item = value?.item
  useEffect(() => { if (item?.title) document.title = `SMP · ${item.title}` }, [item?.title])
  const back = item ? contentReturnHref(item, search) : `/${kind}`
  const body = value && (value.bodyPending ? <p role="status" className="text-slate-400">본문을 준비하고 있습니다. 잠시 후 다시 방문해주세요.</p> : <NotionContent blocks={value.blocks} />)
  return <><SiteHeader /><main className={`relative z-10 mx-auto min-h-[75svh] ${kind === "notice" ? "max-w-5xl px-4 py-10 sm:px-6 sm:py-16" : "max-w-4xl px-6 py-16 sm:py-20"}`}>
    <Link href={back} className="text-sm tracking-widest text-sky-300">← {kind.toUpperCase()}</Link>
    {item ? kind === "notice" ? <NoticeArticle item={item} attachments={<Attachments item={item} />}>{body}</NoticeArticle> : <article className="mt-10">
      <ResearchDetailHeader item={item} />
      <Attachments item={item} />
      <div className="py-8">{body}</div>
      <Related item={item} />
    </article> : <Status error={error} />}
    <div className="mt-14 border-t border-white/20 pt-7"><Link href={back} className="text-sm text-sky-300">목록으로 돌아가기</Link></div>
  </main><SiteFooter /></>
}
function Related({item}:{item:PreparedItem}) {
  const {value}=useApi<ContentResult>("/api/catalog/research")
  const related=useMemo(()=>value && relatedResearch(item,value.items),[item,value])
  if(!related) return null
  return <aside aria-label="관련 리포트" className="mt-12 border-t border-white/20 pt-7"><h2 className="text-sm font-medium text-slate-200">{related.label}</h2><ul className="mt-4 divide-y divide-white/10">{related.items.map(report=><li key={report.id}><Link href={contentHref(report)} className="flex items-center justify-between gap-4 py-4"><span><span className="block text-sm leading-6 text-slate-200">{report.title}</span><time className="text-xs text-slate-500">{formatDate(report.date)}</time></span><span aria-hidden="true">↗</span></Link></li>)}</ul></aside>
}
function Attachments({ item }: { item: PreparedItem }) {
  const pdfs = getPdfSources(item)
  return <section aria-label="첨부 자료" className="mt-8">{pdfs.map((pdf, index) => {
    const url = `/api/content/${item.kind}/${item.id}/pdf?${pdf.query}`
    return <div key={pdf.query} className="mt-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm text-slate-200">{pdf.name}</h3>{(item.kind !== "research" || index > 0) && <a href={`${url}&download=1`} download className="rounded-md bg-sky-300 px-4 py-2 text-sm text-slate-950">PDF 다운로드 ↓</a>}</div><PdfViewer url={url} preview={index === 0 && item.cover ? { url: item.cover.previewUrl, width: item.cover.width, height: item.cover.height, title: item.title } : undefined} /></div>
  })}<ul className="mt-4 space-y-3">{item.attachments.map((file, index) => pdfs.some(pdf => pdf.query === `index=${index}`) ? null : <li key={index}><a href={isTrustedAttachmentUrl(file.url) ? `/api/content/${item.kind}/${item.id}/file?index=${index}` : file.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">{file.name} ↗</a></li>)}{item.externalUrl && !pdfs.some(pdf => pdf.query === "source=external") && <li><a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">관련 링크 열기 ↗</a></li>}</ul></section>
}
export function SearchPage() {
  const query = (useSearch().q ?? "").trim().slice(0, 100)
  const { value, error } = useApi<{ entries: SiteSearchEntry[]; partial: boolean }>("/api/search")
  return <><SiteHeader /><main className="relative z-10 mx-auto min-h-[75svh] max-w-5xl px-6 py-20 sm:py-24"><header className="text-center"><p className="text-[11px] tracking-[0.3em] text-sky-200/80">EXPLORE SMP</p><h1 className="mt-4 text-4xl font-light tracking-wide text-white sm:text-5xl">SEARCH</h1><p className="mt-5 text-sm text-slate-300">SMP의 리포트와 소식, 사람들을 한곳에서 찾아보세요.</p></header><Form action="/search" className="mt-10" role="search"><SearchField key={query} id="search-query" label="검색어" name="q" maxLength={100} defaultValue={query} placeholder="검색어를 입력하세요" /></Form>{!query ? <p className="py-20 text-center text-slate-300">기업명, 리포트 제목, 이름 또는 학과를 입력해보세요.</p> : value ? <SiteSearchResults query={query} index={value} /> : <Status error={error} />}</main><SiteFooter /></>
}
export function NetworkPage({ members = false }: { members?: boolean }) {
  const { value, error } = useApi<MemberResult>("/api/catalog/members")
  const params=useSearch()
  const generation = Number(params.generation)
  const result = useMemo(() => value && ({ ...value, items: sortMembers(value.items.filter(member => member.group === (members ? "members" : "alumni")).map(member=>({...member,image:member.image && isNotionFileUrl(member.image)?`/api/member-photo/${member.id}`:member.image}))) }), [value, members])
  const reserved = [38, 39].filter(g => !value?.items.some(member => member.generation === g && member.group === "alumni"))
  if(!members && params.group==="members") return <Navigate to={`/members?${new URLSearchParams({...(params.generation?{generation:params.generation}:{})})}`} replace />
  return <><SiteHeader />{!result ? <main className="min-h-[75svh]"><Status error={error} /></main> : members ? <main className="relative z-10 mx-auto min-h-[75svh] max-w-6xl px-6 py-14"><NetworkTabs active="members" /><p className="text-xs tracking-[.3em] text-sky-300">NETWORK · OUR MEMBERS</p><h1 className="mt-5 text-4xl font-light text-white sm:text-5xl">MEMBERS</h1><MembersDirectory key={generation} result={result} initialGeneration={generation} reservedGenerations={reserved} /></main> : <AlumniOverview generation={generation} members={result} />}<SiteFooter /></>
}
