import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowLeft,FileText,RefreshCw,Upload,X} from 'lucide-react'
import {api} from './server-storage'
import {useLab} from './use-lab'
import {DraftEditor} from './editor'
import {useConfirmation} from './confirm'
import {linkedUpload,pendingUploads,type UploadLink} from './upload-workflow'
import type {Draft} from './model'

type Props = {
  target?:string; targetTitle?:string; onBack:()=>void; onStorage:()=>void
  onOpen:(id:string)=>Promise<void>; onImport:(id:string)=>Promise<void>
  onBusy:(busy:boolean)=>void; onDirty:(dirty:boolean)=>void
}
export function CmsUpload({target,targetTitle,onBack,onStorage,onOpen,onImport,onBusy,onDirty}:Props) {
  const lab=useLab(),confirm=useConfirmation()
  const [links,setLinks]=useState<UploadLink[]>([]),[connected,setConnected]=useState(false)
  const [checking,setChecking]=useState(true),[error,setError]=useState(''),[dirty,setDirty]=useState(false)
  const [working,setWorking]=useState(false),[editorBusy,setEditorBusy]=useState(false),[tick,setTick]=useState(0)
  const [over,setOver]=useState(false)
  const input=useRef<HTMLInputElement>(null),operation=useRef(false)
  useEffect(()=>{
    let live=true;setChecking(true);setError('')
    void Promise.all([api('/storage/status').then(r=>r.json()),api('/cms/upload-links').then(r=>r.json())])
      .then(([storage,references])=>{if(live){setConnected(storage.connected && !storage.pending);setLinks(references)}})
      .catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setChecking(false)})
    return()=>{live=false}
  },[tick])
  const busy=!!lab.progress||lab.loading||working||editorBusy
  useEffect(()=>{onBusy(busy);return()=>onBusy(false)},[busy,onBusy])
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty])
  const selected=lab.drafts.find(d=>d.id===lab.selected),link=selected?linkedUpload(selected,links):undefined
  const pending=pendingUploads(lab.drafts,links)
  const discarded=lab.drafts.filter(d=>d.trashedAt&&!linkedUpload(d,links))
  const canLeave=()=>!dirty||confirm('저장하지 않은 입력을 닫고 이동할까요?')
  const choose=async(id:string|null)=>{if(!busy&&await canLeave())lab.setSelected(id)}
  const ingest=async(files:File[])=>{
    if(busy||checking||!connected||error||!files.length||!await canLeave())return
    if(target&&files.length!==1){setError('교체할 PDF 한 개를 선택해 주세요.');return}
    await lab.ingest(files)
  }
  const finish=async(draft:Draft,reviewed=true)=>{
    if(operation.current)return
    operation.current=true;setWorking(true);setError('')
    try {
      if(draft.approvedRevision!==draft.revision)await lab.approve(draft,reviewed)
      await onImport(draft.id)
    }catch(e){setError((e as Error).message)}finally{operation.current=false;setWorking(false)}
  }
  const changeDirty=useCallback((value:boolean)=>setDirty(value),[])
  return <>
    <header className="page-heading"><div><h1>{target?'PDF 교체':'PDF 등록'}</h1><p>{target?`‘${targetTitle||'선택한 리포트'}’의 새 PDF를 선택합니다. 기존 제목·분류·순서는 유지합니다.`:'PDF 선택 → 내용 검토 → 리포트 초안. 공개는 리포트에서 ‘게시’를 눌러 결정합니다.'}</p></div><button disabled={busy} onClick={onBack}><ArrowLeft size={16}/>리포트 관리</button></header>
    <div className="upload-storage-status">
      <span>{checking?'저장소 연결 확인 중…':connected?'Google Drive에 비공개로 저장합니다.':'PDF 등록 전에 Google Drive 연결을 완료해 주세요.'}</span>
      <button disabled={busy} onClick={onStorage}>{connected?'연결 관리':'저장소 연결'}</button>
      {!connected&&!checking&&<button disabled={busy} onClick={()=>setTick(n=>n+1)}><RefreshCw size={14}/>다시 확인</button>}
    </div>
    {error&&<p role="alert" className="error-panel">{error}<button disabled={busy} onClick={()=>setTick(n=>n+1)}>다시 확인</button></p>}
    {lab.errors.length>0&&<div className="error-panel" role="alert">{lab.errors.map((e,i)=><p key={i}>{e}</p>)}<button disabled={busy} onClick={onStorage}>저장소 연결 확인</button></div>}
    {lab.message&&<p className="success-panel" role="status">{lab.message}</p>}
    <label className="check-row"><input type="checkbox" checked={lab.aiEnabled} disabled={busy} onChange={e=>lab.setAiEnabled(e.target.checked)}/>AI로 입력 후보 보완</label>
    <p className="field-help">선택하면 앞 3쪽의 전송 내용을 확인한 뒤 AI를 사용합니다. 원문은 자동으로 공개되지 않습니다.</p>
    <input ref={input} className="sr-only" type="file" accept=".pdf,application/pdf" aria-label={target?'새 원본 PDF 선택':'등록할 PDF 선택'} multiple={!target} disabled={busy||checking||!connected||!!error} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void ingest(files)}}/>
    {lab.progress&&<div role="status" className="upload-progress"><span className="progress-indicator"/>{lab.progress}<button onClick={lab.cancel}><X size={15}/>취소</button></div>}
    {selected ? <>
      <div className="cms-actions"><button disabled={busy} onClick={()=>void choose(null)}><ArrowLeft size={15}/>등록 대기로 돌아가기</button></div>
      {link ? <div className="settings-note"><h2>이미 리포트 관리에 등록된 PDF입니다.</h2><p>{link.title}{link.trashedAt?' · 휴지통에 보관 중':''}</p><p>기존 글은 리포트 관리에서 수정합니다. 동일한 원본을 다시 등록하지 않습니다.</p><button disabled={busy} onClick={()=>void onOpen(link.id).catch(e=>setError(e.message))}>기존 리포트 열기</button></div> : <>
        {!selected.trashedAt&&selected.approvedRevision===selected.revision&&<button className="primary" disabled={busy||dirty} onClick={()=>void finish(selected)}>게시 초안 만들기</button>}
        <DraftEditor key={`${selected.id}:${selected.revision}`} draft={selected} locked={busy} workflow onBusy={setEditorBusy} onDirty={changeDirty} onSave={lab.save} onApprove={finish} onTrash={lab.trash} onRemove={lab.remove} onReanalyze={lab.reanalyze} onReplace={lab.replace}/>
      </>}
    </> : <>
      <section className={`pdf-upload-zone ${over?'is-over':''}`} onDragOver={e=>{e.preventDefault();if(!busy)setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);void ingest(Array.from(e.dataTransfer.files))}} aria-label="PDF 파일 등록">
        <Upload size={30}/><h2>{target?'교체할 PDF를 선택하세요':'새 리포트 PDF를 선택하세요'}</h2>
        <p>이곳에 파일을 끌어놓거나 아래 버튼을 누르세요.</p>
        <button className="primary" disabled={busy||checking||!connected||!!error} onClick={()=>input.current?.click()}>PDF 파일 선택</button>
        <p className="field-help">파일당 32MB · {target?'한 번에 1개':'한 번에 최대 5개'} · 새 원본 하루 10개</p>
      </section>
      {!target&&<section className="upload-pending"><header><h2>등록을 마치지 않은 PDF <small>{pending.length}개</small></h2><button disabled={busy} onClick={()=>{void lab.refresh().catch(e=>setError(e.message));setTick(n=>n+1)}}><RefreshCw size={15}/>새로고침</button></header>
        <p className="field-help">업로드 후 검토를 마치지 않은 파일만 표시합니다. 기존 리포트 전체는 ‘리포트’ 메뉴에서 관리합니다.</p>
        {pending.length? <ul>{pending.map(d=><li key={d.id}><FileText size={17}/><div><strong>{d.fields.title||d.filename}</strong><small>{d.filename} · {d.pages}쪽</small></div><button disabled={busy||checking} onClick={()=>void choose(d.id)}>검토 계속하기</button></li>)}</ul>:<p className="empty-state">등록 대기 중인 PDF가 없습니다.</p>}
        {discarded.length>0&&<details><summary>등록을 취소한 PDF · {discarded.length}개</summary><p className="field-help">리포트 초안으로 옮기기 전에 휴지통에 넣은 파일입니다. 파일을 열어 복원할 수 있습니다.</p><ul>{discarded.map(d=><li key={d.id}><span>{d.fields.title||d.filename}</span><button disabled={busy||checking} onClick={()=>void choose(d.id)}>휴지통 파일 열기</button></li>)}</ul></details>}
      </section>}
    </>}
  </>
}
