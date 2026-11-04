import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, RefreshCw, Search } from 'lucide-react'
import { SITE_RANGES, siteDate, siteStart, type ReportAnalytics, type SiteReport } from '../site-model'
import { AdminSelect } from '../ui/select'
import { LoadingState, InlineLoading } from '../ui/loading'
import { ListPagination } from '../list-pagination'
import { useReportAnalytics } from './use-report-analytics'
import { rankingPage, reportInsights, weeklyComparison, type RankingQuery } from './report-insights'
import './report-ranking.css'

const count=(n:number)=>n.toLocaleString('ko-KR')
const stamp=(n:number)=>new Date(n).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
const visibility={private:'비공개',trashed:'휴지통',missing:'연결할 자료 없음'}
export function ReportRanking({query,onChange,onBack}:{query:RankingQuery;onChange:(patch:Partial<RankingQuery>)=>void;onBack:()=>void}) {
  const [refresh,setRefresh]=useState(0),state=useReportAnalytics(refresh)
  return <div className="report-analytics">
    <button className="analytics-back" onClick={onBack}><ArrowLeft size={16}/> 운영 현황</button>
    <header className="page-heading"><div><p className="analytics-eyebrow">RESEARCH INSIGHTS</p><h1>리포트 통계</h1><p>어떤 리포트에 관심이 모였는지 살펴보세요.</p></div>
      <button disabled={state.loading} onClick={()=>setRefresh(n=>n+1)}>{state.loading?<InlineLoading>확인 중…</InlineLoading>:<><RefreshCw size={16}/> 새로고침</>}</button>
    </header>
    {state.error&&<p role="alert" className="error-panel">통계를 불러오지 못했습니다. {state.data?'이전 확인값을 표시합니다. ':''}{state.error}</p>}
    {!state.data&&!state.error&&(state.loading?<LoadingState label="리포트 통계를 불러오는 중…"/>:<div className="analytics-empty">전체 순위를 준비하고 있습니다. 다음 자동 집계가 완료되면 모든 자료의 순위를 볼 수 있습니다.</div>)}
    {state.data&&<ReportRankingContent data={state.data} query={query} onChange={onChange}/>}
  </div>
}
export function ReportRankingContent({data,query,onChange}:{data:ReportAnalytics;query:RankingQuery;onChange:(patch:Partial<RankingQuery>)=>void}) {
  const period=data.periods[query.range],complete=data.complete[query.range]
  const insights=useMemo(()=>reportInsights(period.reports),[period.reports])
  const list=useMemo(()=>rankingPage(period.reports,query),[period.reports,query.q,query.group,query.page,query.metric])
  const semesters=[...new Set(period.reports.flatMap(r=>r.semester?[r.semester]:[]))].sort().reverse()
  const stale=data.trafficError||!data.trafficCheckedAt||Date.now()-data.checkedAt>7200000||Date.now()-data.trafficCheckedAt>7200000
  return <>
    <div className="analytics-period"><div className="site-periods" role="group" aria-label="순위 조회 기간">{SITE_RANGES.map(range=><button key={range} aria-pressed={query.range===range} onClick={()=>onChange({range,page:1})}>{range===1?'오늘':`최근 ${range}일`}</button>)}</div><span>{siteDate(siteStart(data.checkedAt,query.range))} — {siteDate(data.checkedAt)} · KST</span></div>
    {(!complete||stale||data.limitedDays.length>0)&&<p role="status" className="ops-warning analytics-notice">{!complete?'전체 조회 집계가 아직 준비되지 않아 확인된 값만 표시합니다. —는 미확인입니다. ':''}{stale?'최신 수집이 지연돼 마지막 확인값을 표시합니다. ':''}{data.limitedDays.length?'일부 날짜는 이벤트 집계 한도에 도달해 다운로드·PDF 수치가 누락될 수 있습니다.':''}</p>}
    <div className="analytics-kpis">
      <Metric label="리포트 조회" value={period.traffic?count(insights.views):'—'} unit="회" note="리포트 상세 페이지의 조회 합계"/>
      <Metric label="다운로드 클릭" value={count(period.downloads)} unit="회" note={`${count(insights.downloaded)}개 리포트에서 발생`}/>
      <Metric label="관심받은 리포트" value={count(insights.active)} unit="개" note="조회 또는 다운로드 클릭이 있는 자료"/>
      <Metric label="상위 5개 조회 비중" value={complete&&insights.top5Share!==null?insights.top5Share.toFixed(1):'—'} unit="%" note="전체 리포트 조회에서 차지하는 비율"/>
    </div>
    <section className="analytics-panel" aria-labelledby="ranking-title">
      <div className="analytics-section-heading"><div><h2 id="ranking-title">전체 순위</h2><p>{count(data.catalogSize)}개 자료 · 같은 수치는 공동 순위로 표시합니다.</p></div><div className="site-periods" role="group" aria-label="전체 순위 기준"><button aria-pressed={query.metric==='views'} onClick={()=>onChange({metric:'views',page:1})}>조회순</button><button aria-pressed={query.metric==='downloads'} onClick={()=>onChange({metric:'downloads',page:1})}>다운로드순</button></div></div>
      <div className="analytics-filters"><label className="analytics-search"><Search size={17} aria-hidden="true"/><input aria-label="리포트 통계 검색" value={query.q} onChange={e=>onChange({q:e.target.value,page:1})} placeholder="제목, 기업명, 종목코드 검색"/></label><AdminSelect aria-label="통계 학기" value={query.group} onValueChange={group=>onChange({group,page:1})}><option value="">전체 학기</option>{semesters.map(s=><option key={s} value={s}>{s}</option>)}</AdminSelect></div>
      <p className="analytics-result-count" role="status">{count(list.total)}개 자료{query.q||query.group?' · 순위는 전체 자료 기준입니다.':' · 기록이 없는 자료도 함께 표시합니다.'}</p>
      {list.total?<div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th scope="col">순위</th><th scope="col">리포트</th><th scope="col" aria-sort={query.metric==='views'?'descending':'none'}>조회</th><th scope="col" aria-sort={query.metric==='downloads'?'descending':'none'}>다운로드 클릭</th></tr></thead><tbody>{list.rows.map(row=><tr key={row.id}><td className="ranking-number">{row.rank??'—'}</td><td className="ranking-identity"><ReportTitle report={row}/><div className="ranking-meta">{row.semester||'학기 미지정'}{row.company?` · ${row.company}`:''}{row.visibility&&row.visibility!=='public'?<span>{visibility[row.visibility]}</span>:null}</div><PdfDetails report={row}/></td><td className="ranking-value" data-label="조회">{row.views===null?'—':count(row.views)}{complete&&insights.views>0&&row.views!==null&&row.views>0?<div className="ranking-share"><span style={{width:`${row.views/insights.views*100}%`}}/><small>{(row.views/insights.views*100).toFixed(1)}%</small></div>:null}</td><td className="ranking-value" data-label="다운로드 클릭">{count(row.downloads)}</td></tr>)}</tbody></table></div>:<div className="analytics-empty">검색 조건에 맞는 리포트가 없습니다.<button onClick={()=>onChange({q:'',group:'',page:1})}>검색 조건 초기화</button></div>}
      {list.total>0&&<ListPagination page={list.page} pages={list.pages} disabled={false} onPage={page=>onChange({page})}/>}
    </section>
    <div className="analytics-insight-grid"><section className="analytics-panel"><div className="analytics-section-heading"><div><h2>학기별 관심도</h2><p>선택한 기간의 리포트 조회 · 전체 학기 기준</p></div></div>{period.traffic&&insights.views>0?<ol className="semester-bars">{insights.semesters.filter(s=>s.views>0).map(s=><li key={s.semester}><div><span>{s.semester}<small>{s.count}개 자료</small></span><strong>{count(s.views)}<small>회</small></strong></div><progress value={s.views} max={insights.views} aria-label={`${s.semester} 조회 비중`}/><p>다운로드 {count(s.downloads)}회 · 조회 비중 {(s.views/insights.views*100).toFixed(1)}%</p></li>)}</ol>:<p className="analytics-muted">조회가 쌓이면 학기별 관심도를 확인할 수 있습니다.</p>}</section><WeeklyComparison data={data}/></div>
    <footer className="analytics-footnote"><p>집계 시작 {stamp(data.startedAt)} · 수집 확인 {stamp(data.checkedAt)}{data.trafficCheckedAt?` · 조회 확인 ${stamp(data.trafficCheckedAt)}`:''}. 약 1시간 간격으로 집계하며, 새로고침은 저장된 최신 통계를 불러옵니다.</p><details><summary>통계 읽는 법</summary><p>조회는 Cloudflare 추정 집계, 다운로드는 버튼 클릭 횟수입니다. 고유 인원이나 파일 저장 완료 횟수는 아닙니다. 서로 다른 수집 방식이므로 클릭 수가 조회 수보다 클 수 있습니다.</p><p>공개 여부를 바꿔도 같은 리포트의 기록은 이어집니다. 일별 집계는 최근 30일 보관하며, 수집 시작 전 기록은 복원하지 않습니다. 검색·학기 필터는 순위표만 좁히고 상단 요약은 선택한 기간의 전체 자료를 보여줍니다.</p><p>개인 식별정보나 새 추적기는 추가하지 않았습니다. 조회 0회는 완전한 기간별 집계에서 기록이 없다는 뜻이며, —는 확인되지 않은 값입니다. 순위가 —인 자료는 선택한 지표의 기록이 없습니다.</p></details></footer>
  </>
}
function Metric({label,value,unit,note}:{label:string;value:string;unit:string;note:string}) {return <div><span>{label}</span><strong>{value}<small>{unit}</small></strong><p>{note}</p></div>}
function ReportTitle({report}:{report:SiteReport}) {return report.visibility==='public'?<a href={`https://pnusmp.com/research/${report.id}`} target="_blank" rel="noopener noreferrer">{report.title}<ArrowUpRight size={13}/></a>:<span className="ranking-title">{report.title}</span>}
function PdfDetails({report}:{report:SiteReport}) {
  if(report.started===undefined)return null
  return <details className="ranking-pdf"><summary>PDF 열람 상태</summary><dl><div><dt>열람 시작</dt><dd>{count(report.started)}회</dd></div><div><dt>첫 화면 표시</dt><dd>{count(report.ready??0)}회</dd></div><div><dt>최종 실패</dt><dd>{count(report.failed)}회</dd></div><div><dt>표시까지 평균</dt><dd>{report.ready?`${((report.totalMs??0)/report.ready/1000).toFixed(1)}초`:'—'}</dd></div></dl><p>표지·페이지 넘김 제외. 준비 중 이탈은 실패가 아닙니다.</p></details>
}
function WeeklyComparison({data}:{data:ReportAnalytics}) {
  const c=weeklyComparison(data)
  return <section className="analytics-panel"><div className="analytics-section-heading"><div><h2>지난주와 비교</h2><p>오늘을 제외한 7일씩 · 사이트 전체 조회와 리포트 다운로드</p></div></div><div className="week-comparisons">{([{label:'사이트 전체 조회',value:c.views},{label:'다운로드 클릭',value:c.downloads}]).map(({label,value})=><div key={label}><h3>{label}</h3>{value?<><div className="week-values"><span>{c.previousLabel}<strong>{count(value.previous)}<small>회</small></strong></span><span>{c.currentLabel}<strong>{count(value.current)}<small>회</small></strong></span></div><p className="week-change">{value.previous===0?(value.current?'이전 기간 기록 없음 · 증가율 미표시':'두 기간 모두 기록 없음'):`${Math.abs((value.current-value.previous)/value.previous*100).toFixed(1)}% ${value.current>value.previous?'증가':value.current<value.previous?'감소':'변화 없음'}`}</p></>:<p className="analytics-muted">온전한 14일의 집계가 준비되면 비교합니다. 누락·지연된 기간은 비교하지 않습니다.</p>}</div>)}</div></section>
}
