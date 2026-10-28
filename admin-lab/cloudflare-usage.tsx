import {useEffect,useState,type ReactNode} from "react"
import {Cloud,ArrowUpRight} from "lucide-react"
import {api} from "./server-storage"
import {capacityLabel} from "./dashboard-model"
import {CLOUD_FREE,cloudPartStale,type CloudPart,type CloudUsage} from "./cloudflare-model"
import "./cloudflare-usage.css"

const count=(n:number)=>n.toLocaleString('ko-KR',{maximumFractionDigits:0})
const ms=(n:number|null)=>n===null?'자료 없음':`${n.toLocaleString('ko-KR',{maximumFractionDigits:2})} ms`
const time=(n:number)=>new Date(n).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
const labels:Record<string,string>={
  'smp-website-free':'공식 웹사이트','smp-pdf-admin-trial':'관리자',
  'smp-sync-research':'리포트 동기화','smp-sync-notice':'공지 동기화','smp-sync-members':'명단 동기화',
  'smp-report-publication-trial':'게시 시험 사이트','smp-migration-preview':'이전 시험 사이트',
}
function label(name:string) {return labels[name]||name}
function Ratio({value,limit,label:description}:{value:number;limit:number;label:string}) {
  const percentage=value/limit*100
  return <div className="ops-meter"><progress value={Math.min(value,limit)} max={limit} aria-label={description} className={percentage>=90?'is-critical':percentage>=80?'is-warning':''}/>
    <span className={percentage>=80?'ops-warning':'ops-muted'}>{percentage>0&&percentage<0.1?'< 0.1':percentage.toFixed(1)}% 사용{percentage>=100?' · 한도 도달':percentage>=80?' · 주의':''}</span></div>
}
function Freshness({part}:{part:CloudPart<unknown>}) {
  return <p className={cloudPartStale(part)?'ops-warning':'ops-footnote'}>
    {part.checkedAt===null?'아직 사용량을 받지 못했습니다. 다음 자동 수집 후 표시됩니다.':`${time(part.checkedAt)} KST 확인${cloudPartStale(part)?' · 최신 수집 지연: 이전 확인값입니다.':''}`}
  </p>
}
function Metric({title,part,children}:{title:string;part:CloudPart<unknown>;children:ReactNode}) {
  return <div className="cloud-metric"><h3>{title}</h3>{children}<Freshness part={part}/></div>
}
export function CloudflareUsage({refresh}:{refresh:number}) {
  const [state,setState]=useState<{value:CloudUsage|null;error:string}>({value:null,error:''})
  useEffect(()=>{
    let live=true
    void api('/dashboard/cloudflare').then(r=>r.json()).then((value:CloudUsage)=>{if(live)setState({value,error:''})})
      .catch((e:Error)=>{if(live)setState(previous=>({...previous,error:e.message}))})
    return()=>{live=false}
  },[refresh])
  return <section className="ops-panel ops-cloudflare" aria-label="Cloudflare 무료 사용량">
    <header><h2><Cloud size={18}/> Cloudflare 사용량</h2><a className="ops-external" href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Cloudflare 열기 <ArrowUpRight size={14}/></a></header>
    <p className="ops-muted">계정 전체 · 무료 플랜 기준 · 일일 사용량은 매일 오전 9시(KST) 초기화</p>
    {state.error&&<p className="ops-warning" role="alert">사용량을 불러오지 못했습니다. {state.value?'이전 확인값을 표시합니다.':''} {state.error}</p>}
    {!state.value&&!state.error&&<p role="status">저장된 Cloudflare 사용량을 확인하는 중…</p>}
    {state.value&&<CloudflareDetails data={state.value}/>}
    <p className="ops-footnote">기존 자동 게시 작업에서 15분 간격으로 수집합니다. 작업 지연이나 통계 반영 지연이 있을 수 있습니다. 새로고침은 저장된 값만 불러옵니다.</p>
  </section>
}
export function CloudflareDetails({data}:{data:CloudUsage}) {
  const w=data.workers.value,d=data.storage.value,r=data.rows.value
  const slowest=w?.scripts.filter(s=>s.p99Ms!==null).reduce<(typeof w.scripts)[number]|null>((a,s)=>!a||s.p99Ms!>a.p99Ms!?s:a,null)
  return <>
    <div className="cloud-metrics">
      <Metric title="오늘의 Worker 요청" part={data.workers}>{w&&<>
        <div className="cloud-value">{count(w.requests)}<small>/ 100,000회</small></div>
        <Ratio value={w.requests} limit={CLOUD_FREE.requests} label="Worker 일일 요청 한도"/>
        <p className="ops-footnote">관리자·시험 서버 포함. Worker를 실행하지 않는 정적 파일 요청은 제외됩니다.</p>
      </>}</Metric>
      <Metric title="요청당 CPU 처리 시간" part={data.workers}>{w&&<>
        <div className="cloud-value">{ms(slowest?.p99Ms??null)}<small>/ 기준 10 ms</small></div>
        <p className="ops-muted">{slowest?`${label(slowest.name)} · 서버별 P99 중 최댓값`:'측정된 요청 없음'}</p>
        <p className="cloud-cpu-status">리소스 제한으로 중단 <strong className={w.resourceErrors?'ops-warning':''}>{count(w.resourceErrors)}회</strong></p>
        {slowest&&slowest.p99Ms!>CLOUD_FREE.cpuMs&&<p className="ops-warning">일부 요청이 CPU 기준보다 높습니다. 아래 서버별 수치를 확인해 주세요.</p>}
      </>}</Metric>
      <Metric title="DB 실제 저장 공간" part={data.storage}>{d&&<>
        <div className="cloud-value">{capacityLabel(d.bytes)}<small>/ 5 GB</small></div>
        <Ratio value={d.bytes} limit={CLOUD_FREE.storageBytes} label="D1 계정 전체 저장 한도"/>
        <p className="ops-footnote">DB {d.databases.length}개 합계. DB 하나당 최대 500 MB이며 시험 DB도 포함됩니다.</p>
      </>}</Metric>
    </div>
    <div className="cloud-rows">
      <div><span>오늘 DB 읽기</span>{r?<><strong>{count(r.read)} <small>/ 5,000,000행</small></strong><Ratio value={r.read} limit={CLOUD_FREE.rowsRead} label="D1 일일 읽기 한도"/></>:<span className="ops-muted">확인 대기</span>}</div>
      <div><span>오늘 DB 쓰기</span>{r?<><strong>{count(r.written)} <small>/ 100,000행</small></strong><Ratio value={r.written} limit={CLOUD_FREE.rowsWritten} label="D1 일일 쓰기 한도"/></>:<span className="ops-muted">확인 대기</span>}</div>
    </div>
    <Freshness part={data.rows}/>
    <details className="cloud-details"><summary>서버·DB별 상세 사용량</summary>
      {w&&<div className="ops-files"><table><caption>Worker 처리 현황</caption><thead><tr><th>서버</th><th>요청</th><th>CPU 중앙값</th><th>CPU P99</th></tr></thead><tbody>{w.scripts.map(s=><tr key={s.name}><td title={s.name}>{label(s.name)}</td><td>{count(s.requests)}</td><td>{ms(s.p50Ms)}</td><td className={s.p99Ms!==null&&s.p99Ms>CLOUD_FREE.cpuMs?'ops-warning':''}>{ms(s.p99Ms)}</td></tr>)}</tbody></table></div>}
      <p className="ops-footnote">P99는 요청의 99%가 이 시간 이내에 처리됐다는 뜻입니다. CPU는 일일 누적 한도가 아니며, 순간적인 기준 초과가 곧 요청 실패를 뜻하지는 않습니다. 요청·CPU 통계는 Cloudflare의 표본 기반 집계로 반영에 지연이 있습니다.{w?` 처리 오류 합계 ${count(w.errors)}회.`:''}</p>
      {d&&<div className="cloud-databases">{d.databases.map(db=><div key={db.name}><div><span title={db.name}>{label(db.name)}</span><strong>{capacityLabel(db.bytes)} <small>/ 500 MB</small></strong></div><Ratio value={db.bytes} limit={CLOUD_FREE.databaseBytes} label={`${db.name} 저장 한도`}/></div>)}</div>}
      <p className="ops-footnote">이곳의 용량은 Cloudflare DB 실제 크기입니다. Google Drive PDF 용량 및 아래 앱 보호 한도와는 별개입니다. 과금 설정을 변경하거나 유료 서비스에 가입하지 않습니다.</p>
      <div className="ops-links"><a href="https://developers.cloudflare.com/workers/platform/limits/" target="_blank" rel="noopener noreferrer">Workers 공식 한도</a><a href="https://developers.cloudflare.com/d1/platform/pricing/" target="_blank" rel="noopener noreferrer">D1 공식 한도</a></div>
    </details>
  </>
}
