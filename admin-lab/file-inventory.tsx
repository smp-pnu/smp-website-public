import { useEffect, useState } from 'react'
import { ArrowUpRight, Database, FolderOpen, Search } from 'lucide-react'
import { api } from './server-storage'
import { readAssets } from './cloud-storage'
import { sha256 } from '../admin-cloud/protocol'
import { capacityLabel, type Snapshot } from './dashboard-model'
import type { FileInventory, InventoryFile } from './file-inventory-model'
import { adminRouteHash } from './admin-navigation'
import { AdminSelect } from './ui/select'
import { LoadingState, InlineLoading } from './ui/loading'

const states={public:'사이트 사용 중',private:'비공개·게시 준비',retained:'이력·삭제 대기',unlinked:'연결 확인 필요'}
export function FileInventoryPanel({onComplete}:{onComplete:()=>void}) {
  const [snapshot,setSnapshot]=useState<Snapshot<FileInventory>|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(1)
  const [busy,setBusy]=useState(''),[progress,setProgress]=useState(''),[selected,setSelected]=useState<InventoryFile|null>(null),[refresh,setRefresh]=useState(0)
  useEffect(()=>{let live=true;void api('/dashboard/files').then(r=>r.json()).then(s=>{if(live){setSnapshot(s);setError('')}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[refresh])
  const data=snapshot?.value
  const files=data?.files.filter(f=>(filter==='all'||f.state===filter)&&f.name.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').trim().toLowerCase()))??[]
  const pages=Math.max(1,Math.ceil(files.length/10)),current=Math.min(page,pages)
  async function migrate(file:InventoryFile) {
    if(!file.assetId||!file.migrateUpload)return
    setSelected(null);setBusy(file.id);setError('');setProgress('기존 PDF 무결성 확인 중…')
    try {
      const {pdf}=await readAssets(file.migrateUpload),rawSha256=await sha256(new Uint8Array(await pdf.arrayBuffer())),base=`/storage/migrate/${file.assetId}`
      const start=await(await api(`${base}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rawSha256})})).json()
      if(!start.done) {
        if(!Number.isInteger(start.parts)||start.parts<1||start.parts>128)throw Error('원본 크기를 확인하지 못했어요.')
        for(let i=0;i<start.parts;i++){setProgress(`Drive에 원본 복사 중 · ${Math.round(i/start.parts*100)}%`);await api(`${base}/${i}`,{method:'POST'})}
        setProgress('Drive 원본 검증 및 연결 전환 중…');await api(`${base}/finish`,{method:'POST'})
      }
      setProgress('Drive 이전 완료 · 기존 게시글과 PDF 내용을 유지했습니다.');setRefresh(n=>n+1);onComplete()
    } catch(e){setError(`${(e as Error).message} 완료 전의 DB 원본은 그대로 유지됩니다. 같은 버튼으로 다시 시도할 수 있어요.`);setProgress('')}
    finally{setBusy('')}
  }
  return <section className="ops-panel inventory-panel" aria-busy={!!busy}>
    <header><div><h2>리포트 원본 · 용량순</h2><p className="ops-footnote">공개 페이지·초안·수정 이력의 실제 파일 연결을 대조합니다.</p></div><button className="ops-text-button" disabled={!!busy} onClick={()=>setRefresh(n=>n+1)}>목록 새로고침</button></header>
    {error&&<p className="ops-warning" role="alert">{error}</p>}
    {!snapshot&&!error&&<LoadingState label="리포트와 원본 연결을 확인하는 중…" rows={3}/>}
    {snapshot?.stale&&<p className="ops-warning">최근 조회를 마치지 못했습니다. {data?'이전 확인값을 표시합니다.':'잠시 후 다시 확인해 주세요.'}</p>}
    {data&&<>
      <div className="inventory-summary"><span>원본 <strong>{data.files.length}개</strong></span><span>사이트 사용 중 <strong>{data.publicFiles}개</strong></span><span>확인된 용량 <strong>{capacityLabel(data.totalBytes)}</strong></span>{data.unknown>0&&<span>크기 미확인 {data.unknown}개</span>}</div>
      <div className="inventory-controls"><label><Search size={16}/><input aria-label="원본 리포트 검색" placeholder="리포트 제목 검색" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></label><AdminSelect aria-label="원본 사용 상태" value={filter} onValueChange={v=>{setFilter(v);setPage(1)}}><option value="all">전체 사용 상태</option>{Object.entries(states).map(([v,label])=><option key={v} value={v}>{label}</option>)}</AdminSelect></div>
      <div className="inventory-list">{files.slice((current-1)*10,current*10).map(f=>{
        const refs=[...new Map(f.references.map(r=>[r.id,r])).values()],published=f.references.find(r=>r.usage==='public'),manage=f.references.find(r=>r.usage!=='history')??f.references[0]
        return <article key={f.id} className="inventory-row"><div className="inventory-file"><span className={`inventory-state is-${f.state}`}>{states[f.state]}</span><strong>{f.name}</strong><small>{f.provider==='drive'?<FolderOpen size={13}/>:<Database size={13}/>} {f.provider==='drive'?'Google Drive':'이전 DB 원본'}{refs.length>1?` · 연결 게시글 ${refs.length}개`:''}{f.deleteAfter?` · ${new Date(f.deleteAfter).toLocaleDateString('ko-KR')} 이후 정리 대상`:''}</small></div>
          <strong className="inventory-size">{f.bytes===null?'미확인':capacityLabel(f.bytes)}</strong>
          <div className="inventory-actions">{published&&<a href={`https://pnusmp.com/research/${published.id}`} target="_blank" rel="noopener noreferrer">사이트 보기<ArrowUpRight size={13}/></a>}{manage&&<a href={adminRouteHash({section:'research',entry:manage.id})}>게시글 관리</a>}{f.driveId&&<a href={`https://drive.google.com/file/d/${f.driveId}/view`} target="_blank" rel="noopener noreferrer">Drive 원본<ArrowUpRight size={13}/></a>}{f.migrateUpload&&<button disabled={!!busy} onClick={()=>setSelected(f)}>Drive로 옮기기</button>}{!manage&&<span className="ops-muted">게시 연결 없음 · 원본 확인 후 정리</span>}</div>
          {refs.length>1&&<details className="inventory-references"><summary>연결된 게시글 보기</summary>{refs.map(r=><a key={r.id} href={adminRouteHash({section:'research',entry:r.id})}>{r.title}</a>)}</details>}
        </article>
      })}</div>
      {!files.length&&<p className="ops-muted">조건에 맞는 원본이 없습니다.</p>}
      {pages>1&&<nav className="inventory-pages" aria-label="원본 용량 목록 페이지"><button disabled={current===1} onClick={()=>setPage(current-1)}>이전</button><span>{current} / {pages}</span><button disabled={current===pages} onClick={()=>setPage(current+1)}>다음</button></nav>}
      <p className="ops-footnote">등록·게시 준비 시 기록한 원본 크기입니다. 목록은 5분간 재사용하며 Drive 전체를 매번 조회하지 않습니다. ‘연결 확인 필요’는 테스트 파일이라는 뜻이 아닙니다. 공개·삭제 처리는 게시글 관리에서 진행해 주세요.</p>
    </>}
    {progress&&<p className="inventory-progress" role="status">{busy?<InlineLoading>{progress}</InlineLoading>:progress}</p>}
    {selected&&<div className="inventory-confirm" role="region" aria-label="Drive 이전 확인"><strong>{selected.name}</strong><p>원본을 연결된 Drive 폴더로 복사하고, 내용 검증 후 저장 위치를 전환합니다. 게시 주소·내용·수정 이력은 유지됩니다.</p><div><button className="primary" onClick={()=>void migrate(selected)}>원본 확인하고 이전</button><button onClick={()=>setSelected(null)}>취소</button></div></div>}
  </section>
}
