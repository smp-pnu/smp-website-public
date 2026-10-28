import { LoadingState } from "./ui/loading";
import {useEffect,useState} from 'react'
import {ChartNoAxesCombined} from 'lucide-react'
import {api} from './server-storage'
import {SITE_RANGES,siteDate,siteStart,type SiteRange,type SiteSnapshot} from './site-model'
import './site-analytics.css'
const count=(n:number)=>n.toLocaleString('ko-KR')
const stamp=(n:number)=>new Date(n).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
export function SiteAnalytics({refresh}:{refresh:number}){
 const [state,setState]=useState<{data:SiteSnapshot|null;loaded:boolean;error:string}>({data:null,loaded:false,error:''})
 useEffect(()=>{let live=true;void api('/dashboard/site').then(r=>r.json()).then((data:SiteSnapshot|null)=>{if(live)setState({data,loaded:true,error:''})}).catch((e:Error)=>{if(live)setState(p=>({...p,loaded:true,error:e.message}))});return()=>{live=false}},[refresh])
 return <section className="ops-panel ops-site" aria-label="사이트 현황"><header><h2><ChartNoAxesCombined size={18}/> 사이트 현황</h2><span className="ops-muted">pnusmp.com · 공개 사이트</span></header>
 {state.error&&<p className="ops-warning" role="alert">통계를 확인하지 못했습니다. {state.data?'이전 확인값입니다.':''} {state.error}</p>}
 {!state.data&&!state.error&&(state.loaded?<p className="site-empty">집계를 시작합니다. 첫 자동 수집이 완료되면 표시됩니다.</p>:<LoadingState label="저장된 사이트 통계를 불러오는 중…" />)}
 {state.data&&<SiteAnalyticsDetails data={state.data}/>}
 </section>
}
export function SiteAnalyticsDetails({data}:{data:SiteSnapshot}){
 const [range,setRange]=useState<SiteRange>(7),[rank,setRank]=useState<'views'|'downloads'>('views')
 const p=data.periods[range],traffic=p.traffic,days=Array.from({length:range},(_,i)=>siteDate(siteStart(data.checkedAt,range)+i*86400000))
 const daily=days.map(day=>({day,views:traffic?.daily.find(d=>d.day===day)?.views??0,visits:traffic?.daily.find(d=>d.day===day)?.visits??0,downloads:p.dailyDownloads.find(d=>d.day===day)?.count??0}))
 const maximum=Math.max(1,...daily.map(d=>d.views)),outcomes=p.ready+p.failed
 const rows=[...p.reports].sort((a,b)=>(b[rank]??0)-(a[rank]??0)||b.downloads-a.downloads).slice(0,10)
 const refs=traffic?.referrers.filter(r=>r.host!=='pnusmp.com'&&r.host!=='www.pnusmp.com')??[]
 const trafficOld=data.trafficError||data.trafficCheckedAt===null||Date.now()-data.trafficCheckedAt>2*3600000
 return <>
 <p className="ops-footnote">약 1시간 간격으로 집계합니다. 실시간 수치는 아니며, 자동 작업·통계 처리 지연이 더해질 수 있습니다.</p>
 <div className="site-toolbar"><div className="site-periods" role="group" aria-label="통계 조회 기간">{SITE_RANGES.map(n=><button key={n} aria-pressed={range===n} onClick={()=>setRange(n)}>{n===1?'오늘':`최근 ${n}일`}</button>)}</div><span className="ops-muted">{days[0]} — {days.at(-1)} · KST</span></div>
 <div className="site-metrics">
  <div><span>방문</span><strong>{traffic?count(traffic.visits):'—'}<small>회</small></strong><p>외부 유입·직접 방문 기준</p></div>
  <div><span>페이지 조회</span><strong>{traffic?count(traffic.views):'—'}<small>회</small></strong><p>홈·리포트·공지 등 전체</p></div>
  <div><span>다운로드 클릭</span><strong>{count(p.downloads)}<small>회</small></strong><p>파일 저장 완료 횟수와 다름</p></div>
  <div><span>PDF 첫 화면 표시</span><strong>{outcomes?`${(p.ready/outcomes*100).toFixed(1)}`:'—'}<small>%</small></strong><p>완료 결과 {count(outcomes)}건 기준</p></div>
 </div>
 {trafficOld&&<p className="ops-warning">방문·조회 통계 {data.trafficCheckedAt?`${stamp(data.trafficCheckedAt)} 확인값입니다. 최신 수집이 지연됐습니다.`:'연결 또는 첫 수집을 기다리고 있습니다. 확인되지 않은 수치는 0으로 표시하지 않습니다.'}</p>}
 {Date.now()-data.checkedAt>2*3600000&&<p className="ops-warning">집계 갱신이 지연돼 이전 확인값을 표시합니다.</p>}
 {data.limitedDays.length>0&&<p className="ops-warning">다운로드·PDF 집계 보호 한도에 도달한 날이 있습니다. 해당 날짜의 수치는 일부만 수집됐습니다. {data.limitedDays.join(', ')} (UTC 기준)</p>}
 <div className="site-chart"><h3>조회 추이</h3>{traffic&&traffic.views>0?<><div className="site-bars" role="img" aria-label={`${range}일간 일별 페이지 조회. 아래 일별 수치 펼치기에서 정확한 수치를 확인할 수 있습니다.`}>{daily.map(d=><div key={d.day} title={`${d.day}: 조회 ${d.views}회 · 방문 ${d.visits}회`}><span style={{height:`${d.views/maximum*100}%`}}/></div>)}</div><div className="site-chart-axis"><span>{days[0].slice(5)}</span><span>일별 조회 · 최대 {count(maximum)}회</span><span>{days.at(-1)?.slice(5)}</span></div></>:<p className="site-empty">{traffic?'아직 수집된 조회가 없습니다. 새 방문부터 그래프에 쌓입니다.':'방문 통계가 연결되면 조회 추이를 표시합니다.'}</p>}
 <details className="site-daily"><summary>일별 수치 펼치기</summary><div className="ops-files"><table><thead><tr><th>날짜</th><th>방문</th><th>조회</th><th>다운로드 클릭</th></tr></thead><tbody>{daily.map(d=><tr key={d.day}><td>{d.day}</td><td>{traffic?count(d.visits):'—'}</td><td>{traffic?count(d.views):'—'}</td><td>{count(d.downloads)}</td></tr>)}</tbody></table></div></details></div>
 <div className="site-columns"><div><div className="site-subhead"><h3>인기 리포트</h3><div className="site-periods" role="group" aria-label="리포트 순위 기준"><button aria-pressed={rank==='views'} onClick={()=>setRank('views')}>조회순</button><button aria-pressed={rank==='downloads'} onClick={()=>setRank('downloads')}>다운로드순</button></div></div>
 {rows.length?<div className="ops-files"><table><thead><tr><th>리포트</th><th>조회</th><th>클릭</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id}><td><span className="site-rank">{i+1}</span><a href={`https://pnusmp.com/research/${r.id}`} target="_blank" rel="noopener noreferrer">{r.title}</a></td><td>{r.views===null?'—':count(r.views)}</td><td>{count(r.downloads)}</td></tr>)}</tbody></table></div>:<p className="site-empty">리포트 조회·다운로드가 모이면 표시됩니다.</p>}</div>
 <div><h3>유입 경로</h3>{refs.length?<ol className="site-referrers">{refs.slice(0,8).map(r=><li key={r.host}><span>{r.host||'직접 방문 · 출처 확인 불가'}</span><strong>{count(r.visits)}<small>회</small></strong></li>)}</ol>:<p className="site-empty">수집된 유입 경로가 없습니다.</p>}<p className="ops-footnote">외부 사이트 도메인만 표시합니다. 검색어·개인 식별정보는 수집하지 않습니다. 앱·메신저는 직접 방문으로 표시될 수 있습니다.</p></div></div>
 <div className="site-pdf"><h3>PDF 열람 상태</h3><dl><div><dt>열람 시작</dt><dd>{count(p.started)}회</dd></div><div><dt>첫 화면 표시</dt><dd>{count(p.ready)}회</dd></div><div><dt>첫 화면 최종 실패</dt><dd className={p.failed?'ops-warning':''}>{count(p.failed)}회</dd></div><div><dt>표시까지 평균</dt><dd>{p.averageMs===null?'—':`${(p.averageMs/1000).toFixed(1)}초`}</dd></div><div><dt>10초 초과 표시</dt><dd>{count(p.slow)}회</dd></div></dl><p className="ops-footnote">뷰어 시작부터 실제 PDF 화면 표시까지 측정하며 수동 재시도는 새 시도입니다. 표지 미리보기·페이지 넘김·자동 파일 요청은 제외합니다. 준비 중 이탈·차단·전송 누락은 실패로 간주하지 않습니다.</p></div>
 <details className="site-definition"><summary>집계 기준과 무료 운영 보호</summary><p>방문은 고유 인원 수가 아닙니다. Cloudflare Web Analytics의 방문·조회는 봇을 제외한 추정 집계이며 광고 차단 등으로 누락될 수 있습니다. 다운로드는 사람이 다운로드 링크를 누른 횟수입니다.</p><p>다운로드·PDF 이벤트는 하루 최대 2,000건(UTC 기준)을 저장합니다. 한도에 도달해도 PDF와 웹사이트는 계속 작동합니다. 식별용 쿠키·IP·검색어·PDF 내용은 저장하지 않습니다. 중복 방지 기록은 2일, 일별 집계는 30일 보관합니다. 자동 정리가 2일 넘게 중단되면 새 이벤트 수집도 멈춥니다.</p><p>집계 시작 {stamp(data.startedAt)} · 과거 자료를 소급 집계하지 않습니다. 방문·조회는 시간당 1회, 다운로드·PDF도 기존 게시 작업을 통해 시간당 1회 갱신합니다.</p></details>
 <p className="ops-footnote">다운로드·PDF 확인 {stamp(data.checkedAt)}{data.trafficCheckedAt?` · 방문·조회 확인 ${stamp(data.trafficCheckedAt)}`:''} · 상단 새로고침으로 최신 저장본을 불러옵니다. 화면을 열어 둔 동안 자동 갱신하지 않습니다.</p>
 </>
}
