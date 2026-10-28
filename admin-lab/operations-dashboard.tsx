import { LoadingState, InlineLoading } from "./ui/loading";
import { useEffect, useState } from "react"
import { ArrowUpRight, RefreshCw, HardDrive } from "lucide-react"
import type { Kind } from "../cms/model"
import { api } from "./server-storage"
import { capacityLabel, type DashboardData, type DriveCapacity, type Snapshot } from "./dashboard-model"
import "./operations-dashboard.css"
import { CloudflareUsage } from "./cloudflare-usage"
import { SiteAnalytics } from "./site-analytics"

const names: Record<Kind,string> = {research:"리포트",notice:"공지사항",members:"회원 명단"}
const time = (value: number | null) => value ? new Date(value).toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "아직 확인하지 못함"
type Props = { onNavigate: (kind: Kind, state?: string) => void; onStorage: () => void; onUpload: () => void }
type State<T> = { snapshot: Snapshot<T> | null; error: string }

function Meter({ label, value, limit, bytes = true }: {label:string;value:number;limit:number;bytes?:boolean}) {
  const percent = Math.round(value / limit * 1000) / 10
  return <div className="ops-meter">
    <div><span>{label}</span><strong>{bytes ? capacityLabel(value) : value.toLocaleString()} <small>/ {bytes ? capacityLabel(limit) : limit.toLocaleString()}</small></strong></div>
    <progress className={percent>=90?"is-critical":percent>=80?"is-warning":""} value={Math.min(value,limit)} max={limit} aria-label={label}/>
    <span className="ops-muted">{percent}% 사용{percent>=80 ? " · 정리가 필요합니다" : ""}</span>
  </div>
}
function SnapshotNote({snapshot,error,label}:{snapshot:Snapshot<unknown>|null;error:string;label:string}) {
  if(error) return <p className="ops-warning" role="alert">{label} 조회 실패: {error} {snapshot?.value ? "이전 확인값을 표시합니다." : "새로고침으로 다시 확인해 주세요."}</p>
  if(snapshot?.stale) return <p className="ops-warning" role="status">{snapshot.value ? `${label} 최신 조회를 완료하지 못해 이전 확인값을 표시합니다.` : `${label}를 확인하지 못했거나 다른 화면에서 확인 중입니다.`} 잠시 후 새로고침해 주세요.</p>
  return null
}
export function OperationsDashboard(props: Props) {
  const [overview,setOverview] = useState<State<DashboardData>>({snapshot:null,error:""})
  const [drive,setDrive] = useState<State<DriveCapacity>>({snapshot:null,error:""})
  const [tick,setTick] = useState(0), [loading,setLoading] = useState(true)
  useEffect(()=>{
    let live = true
    setLoading(true)
    const get = async <T,>(path:string,set:(update:(previous:State<T>)=>State<T>)=>void) => {
      try {const snapshot:Snapshot<T> = await(await api(path)).json();if(live)set(()=>({snapshot,error:""}))}
      catch(e) {if(live)set(previous=>({...previous,error:(e as Error).message}))}
    }
    void Promise.all([get("/dashboard",setOverview),get("/dashboard/drive",setDrive)]).finally(()=>{if(live)setLoading(false)})
    return ()=>{live=false}
  },[tick])
  return <>
    <header className="page-heading"><div><h1>운영 현황</h1><p>게시 자료와 저장 공간을 한곳에서 확인합니다.</p></div>
      <div className="cms-actions"><button disabled={loading} onClick={()=>setTick(n=>n+1)}>{loading?<InlineLoading>확인 중…</InlineLoading>:<><RefreshCw size={15}/>새로고침</>}</button><button className="primary" onClick={props.onUpload}>PDF 등록</button></div>
    </header>
    <div className="ops-dashboard">
      <SnapshotNote snapshot={overview.snapshot} error={overview.error} label="운영 현황"/>
      {!overview.snapshot?.value && !overview.error && !overview.snapshot && <LoadingState label="관리 자료를 확인하는 중…" />}
      {overview.snapshot?.value && <ContentSummary data={overview.snapshot.value} {...props}/>}
      <SiteAnalytics refresh={tick}/>
      <CloudflareUsage refresh={tick}/>
      <div className="ops-columns">
        <section className="ops-panel ops-drive">
          <header><h2><HardDrive size={18}/> Google 저장 공간</h2><button className="ops-text-button" onClick={props.onStorage}>연결 관리 <ArrowUpRight size={14}/></button></header>
          <SnapshotNote snapshot={drive.snapshot} error={drive.error} label="Google 저장 공간"/>
          {drive.snapshot?.value ? <DriveCard data={drive.snapshot.value} onStorage={props.onStorage}/> : !drive.error && !drive.snapshot && <LoadingState label="Google 계정 용량을 확인하는 중…" rows={2} />}
          <p className="ops-footnote">마지막 확인 {time(drive.snapshot?.checkedAt??null)} · 조회 결과는 10분간 재사용합니다.</p>
        </section>
        {overview.snapshot?.value && <Attention data={overview.snapshot.value} {...props}/>}
      </div>
      {overview.snapshot?.value && <DashboardDetails data={overview.snapshot.value} {...props}/>}
      <p className="ops-footnote">관리 자료 확인 {time(overview.snapshot?.checkedAt??null)} · 운영 수치는 최대 1분 전 값입니다. 자동 반복 조회는 하지 않습니다.</p>
    </div>
  </>
}
function ContentSummary({data,onNavigate}:Props & {data:DashboardData}) {
  return <div className="ops-summary">{data.content.map(c=><button key={c.kind} onClick={()=>onNavigate(c.kind)}>
    <span>{names[c.kind]} <ArrowUpRight size={16}/></span><strong>{(c.total-c.trash).toLocaleString()}<small>{c.kind==='members'?'명':'개'}</small></strong>
    <span className="ops-muted">공개 {c.published} · 비공개 {c.drafts}{c.changed?` · 수정 초안 ${c.changed}`:""}</span>
  </button>)}</div>
}
export function DriveCard({data,onStorage}:{data:DriveCapacity;onStorage:()=>void}) {
  const q=data.quota
  if(!data.connected) return <div><p>Drive가 연결되지 않았습니다. 기존 저장 자료는 유지됩니다.</p><button onClick={onStorage}>파일 저장소 확인</button></div>
  return <>
    <p className="ops-muted">{data.email}</p>
    {q && <>
      <div className="ops-capacity"><strong>{q.remaining===null?"한도 정보 없음":capacityLabel(q.remaining)}</strong><span>{q.remaining===null?"Google이 최대 용량을 제공하지 않았습니다.":"사용 가능"}</span></div>
      {q.limit!==null?<Meter label="Google 계정 전체" value={q.usage} limit={q.limit}/>:<p>현재 사용량 {capacityLabel(q.usage)}</p>}
      <dl className="ops-breakdown"><div><dt>Drive 파일</dt><dd>{q.drive===null||q.trash===null?"확인 불가":capacityLabel(q.drive-q.trash)}</dd></div>
        <div><dt>Drive 휴지통</dt><dd>{q.trash===null?"확인 불가":capacityLabel(q.trash)}</dd></div>
        <div><dt>Gmail·Photos 등</dt><dd>{q.other===null?"확인 불가":capacityLabel(q.other)}</dd></div></dl>
      <p className="ops-footnote">이 사이트 외의 파일·메일·사진도 포함한 계정 전체 용량입니다. Drive 휴지통도 공간을 사용합니다.</p>
    </>}
    <div className="ops-links">{data.folderUrl&&<a href={data.folderUrl} target="_blank" rel="noopener noreferrer">리포트 Drive 폴더 <ArrowUpRight size={14}/></a>}
      <a href="https://drive.google.com/drive/quota" target="_blank" rel="noopener noreferrer">Drive 용량순 보기 <ArrowUpRight size={14}/></a>
      <a href="https://one.google.com/storage" target="_blank" rel="noopener noreferrer">Google 전체 용량 <ArrowUpRight size={14}/></a></div>
    <p className="ops-footnote">학회 계정으로 열어 주세요. 사이트 자료 삭제는 리포트·공지 관리에서 진행해야 연결 정보도 함께 정리됩니다.</p>
  </>
}
function Attention({data,onNavigate,onStorage}:Props & {data:DashboardData}) {
  const jobs=data.jobs, drafts=data.content.reduce((n,c)=>n+c.changed,0), trash=data.content.reduce((n,c)=>n+c.trash,0)
  return <section className="ops-panel"><header><h2>확인할 작업</h2><span className={jobs.failed+jobs.cleanupFailed?"ops-warning":"ops-muted"}>{jobs.failed+jobs.cleanupFailed?`오류 ${jobs.failed+jobs.cleanupFailed}건`:"등록된 처리 오류 없음"}</span></header>
    <div className="ops-task-list">
      <button onClick={()=>onNavigate('research')}><span>PDF 게시 준비<small>오류가 있는 자료는 리포트에서 확인</small></span><strong>{jobs.pending}건{jobs.failed>0&&<small className="ops-warning">오류 {jobs.failed}</small>}</strong></button>
      <div><span>공개본과 다른 수정 초안<small>각 목록에서 확인 후 공개해 주세요</small></span><strong>{drafts}개</strong></div>
      <div><span>휴지통 보관 자료<small>30일 복원 기간 후 자동 정리 대상</small></span><strong>{trash}개</strong></div>
      <button onClick={onStorage}><span>파일 정리 대기<small>기존 Drive 원본은 삭제하지 않습니다</small></span><strong>{jobs.cleanup}개{jobs.cleanupFailed>0&&<small className="ops-warning">재시도 {jobs.cleanupFailed}</small>}</strong></button>
    </div>
    <div className="ops-links">{data.content.filter(c=>c.trash>0).map(c=><button className="ops-text-button" key={c.kind} onClick={()=>onNavigate(c.kind,'trash')}>{names[c.kind]} 휴지통 {c.trash} <ArrowUpRight size={14}/></button>)}</div>
  </section>
}
function DashboardDetails({data,onNavigate}:Props & {data:DashboardData}) {
  const s=data.storage,d=data.daily,o=data.originals
  return <>
    <section className="ops-panel"><header><h2>사이트 저장 공간</h2><span className="ops-muted">앱에 설정된 보호 한도</span></header>
      <div className="ops-budget-grid"><Meter label="PDF 표지·관리자 보관 파일" value={s.adminBytes} limit={s.adminLimit}/><Meter label="공지·명단 사진" value={s.assetsBytes} limit={s.assetsLimit}/>
        <Meter label="게시글·명단·수정 이력" value={s.metadataBytes} limit={s.metadataLimit}/><Meter label="관리 자료 수 · 휴지통 포함" value={s.entries} limit={s.entryLimit} bytes={false}/></div>
      <p className="ops-footnote">Drive의 PDF 원본은 위 파일 한도에서 제외됩니다. Cloudflare DB의 실제 크기나 계정 전체 사용량이 아닌, 앱이 제한하는 자료 용량입니다.</p>
    </section>
    <div className="ops-columns">
      <section className="ops-panel"><header><h2>오늘의 처리량</h2><span className="ops-muted">매일 09:00 KST 초기화</span></header>
        <div className="ops-daily"><Meter label="Drive 새 원본 저장 시도" value={d.uploads} limit={d.uploadsLimit} bytes={false}/><Meter label="AI 입력 보완 시도" value={d.ai} limit={d.aiLimit} bytes={false}/><Meter label="관리자 API 요청" value={d.requests} limit={d.requestsLimit} bytes={false}/></div>
        <p className="ops-footnote">성공 여부와 관계없이 예산을 사용한 시도 수입니다. 다음 초기화 {time(d.resetsAt)}. 방문자 수·사이트 전체 요청량·CPU 사용량은 포함하지 않습니다.</p>
        <a className="ops-external" href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Cloudflare 사용량 확인 <ArrowUpRight size={14}/></a>
      </section>
      <section className="ops-panel"><header><h2>PDF 보관 현황</h2><button className="ops-text-button" onClick={()=>onNavigate('research')}>리포트 관리 <ArrowUpRight size={14}/></button></header>
        <dl className="ops-file-stats"><div><dt>관리자에서 보관한 원본</dt><dd>{o.count}개 · {capacityLabel(o.driveBytes+o.databaseBytes)}</dd></div><div><dt>Drive에 저장</dt><dd>{capacityLabel(o.driveBytes)}</dd></div><div><dt>기존 DB에 저장</dt><dd>{capacityLabel(o.databaseBytes)}</dd></div><div><dt>그중 교체·삭제 후 보관분</dt><dd>{capacityLabel(o.retainedBytes)}</dd></div><div><dt>업로드 준비 중</dt><dd>{o.staging}개</dd></div></dl>
        <p className="ops-footnote">이전 방식으로 연결된 리포트 {o.legacyReports}개는 원본 크기를 따로 기록하지 않아 위 합계에 포함하지 않습니다. 같은 Google 계정의 파일은 Google 전체 용량에 포함됩니다.</p>
      </section>
    </div>
    <section className="ops-panel"><header><h2>관리자 보관 PDF · 용량순</h2><span className="ops-muted">용량이 큰 파일 10개</span></header>
      <p className="ops-footnote">새 관리자에 저장하거나 이관한 PDF 원본만 표시합니다. 기존 Drive 폴더에 연결된 리포트 전체 목록은 아닙니다. ‘DB’는 이전에 데이터베이스에 직접 보관한 원본을 뜻합니다.</p>
      {data.files.length?<div className="ops-files"><table><thead><tr><th>파일</th><th>저장 위치</th><th>용량</th></tr></thead><tbody>{data.files.map((f,i)=><tr key={i}><td>{f.name}{f.retained===1&&<small>교체·삭제 후 보관분</small>}</td><td>{f.provider==='drive'?'Drive':'DB'}</td><td>{capacityLabel(f.bytes)}</td></tr>)}</tbody></table></div>:<p className="ops-muted">관리자에서 새로 저장한 PDF 원본이 없습니다.</p>}
    </section>
  </>
}
