import { useEffect, useRef, useState } from "react"
import { ArrowLeft, FileSpreadsheet, WandSparkles } from "lucide-react"
import { api } from "./server-storage"
import { useConfirmation } from "./confirm"
import { readRosterWorkbook } from "./member-workbook"
import { cleanRosterText, duplicateRosterRows, emptyMapping, headerRow, rosterCandidates, rosterFields, rosterLabels, rosterLimits, rosterProfile, suggestMapping, validMemberName, validateRosterMapping, type ExistingMember, type RosterCandidate, type RosterMapping, type RosterSheet } from "./member-import-model"
import "./member-import.css"

export function MemberImport({ initialGeneration, onClose, onBusy, onComplete }: {initialGeneration:string;onClose:()=>void;onBusy:(value:boolean)=>void;onComplete:(generation:number,count:number,skipped:number)=>void}) {
  const [sheets,setSheets]=useState<RosterSheet[]>([]),[sheetIndex,setSheetIndex]=useState(0),[header,setHeader]=useState(0),[filename,setFilename]=useState("")
  const [generation,setGeneration]=useState(initialGeneration),[group,setGroup]=useState("members"),[mapping,setMapping]=useState<RosterMapping>(emptyMapping)
  const [candidates,setCandidates]=useState<RosterCandidate[]>([]),[existing,setExisting]=useState<ExistingMember[]>([]),[previewPage,setPreviewPage]=useState(1)
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[note,setNote]=useState(""),[status,setStatus]=useState("")
  const running=useRef(false),batchId=useRef(crypto.randomUUID()),confirm=useConfirmation(),sheet=sheets[sheetIndex]
  const duplicates=duplicateRosterRows(candidates,existing)
  const eligible=(c:RosterCandidate)=>!c.error&&!duplicates.has(c.row)&&validMemberName(c.name)
  const bulkEligible=(c:RosterCandidate)=>eligible(c)&&!c.note.includes("제외·미수료")
  const selected=candidates.filter(c=>c.selected&&eligible(c))
  const pageCount=Math.max(1,Math.ceil(candidates.length/40)),visible=candidates.slice((previewPage-1)*40,previewPage*40)
  useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(sheets.length){e.preventDefault();e.returnValue=""}};window.addEventListener("beforeunload",listener);return()=>window.removeEventListener("beforeunload",listener)},[sheets.length])
  const run=async(work:()=>Promise<void>)=>{
    if(running.current)return;running.current=true;setBusy(true);onBusy(true);setError("")
    try{await work()}catch(e){setError(e instanceof Error?e.message:"명단을 확인해 주세요.")}finally{running.current=false;setBusy(false);onBusy(false);setStatus("")}
  }
  const resetPreview=()=>{setCandidates([]);setExisting([]);setPreviewPage(1);batchId.current=crypto.randomUUID();setNote("")}
  const configure=(next:RosterSheet,row=headerRow(next))=>{setHeader(row);setMapping(suggestMapping(rosterProfile(next,row)));resetPreview()}
  const choose=async(file:File)=>run(async()=>{
    setSheets([]);resetPreview()
    setStatus("엑셀을 기기에서 읽는 중")
    const loaded=await readRosterWorkbook(file)
    if(!loaded.length)throw Error("읽을 수 있는 명단 시트가 없어요.")
    setSheets(loaded);setSheetIndex(0);setFilename(file.name);configure(loaded[0])
    await connectAi(loaded[0],headerRow(loaded[0]))
  })
  const connectAi=async(next:RosterSheet,row:number)=>{
    const columns=rosterProfile(next,row);setStatus("AI가 열 구성을 확인하는 중")
    try {
      const response=await api("/member-import/mapping",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reviewed:true,columns})})
      const result=await response.json();setMapping(validateRosterMapping(result.mapping,columns.length));resetPreview()
      setNote(result.warning??(result.cached?"같은 엑셀 형식의 AI 분석 결과를 재사용했어요.":"AI 열 연결을 적용했어요. 아래 항목을 확인해 주세요."))
    } catch {setNote("AI 연결을 사용하지 못했어요. 기본 열 연결을 확인하거나 직접 수정해 주세요.")}
  }
  const analyze=()=>run(async()=>{if(sheet)await connectAi(sheet,header)})
  const prepare=()=>run(async()=>{
    const n=Number(generation)
    if(!sheet||!Number.isInteger(n)||n<1||n>999)throw Error("등록할 기수를 먼저 입력해 주세요.")
    if(mapping.name===null)throw Error("이름에 해당하는 열을 연결해 주세요.")
    const columns=Object.values(mapping).filter(c=>c!==null)
    if(new Set(columns).size!==columns.length)throw Error("같은 엑셀 열이 여러 항목에 연결되어 있어요. 항목별로 다른 열을 선택해 주세요.")
    setStatus("기존 명단과 중복을 확인하는 중")
    const result=await(await api(`/cms/member-import?generation=${n}`)).json()
    const people=rosterCandidates(sheet,header,mapping,n)
    if(!people.length)throw Error("이름이 있는 행을 찾지 못했어요. 제목 행과 이름 열을 확인해 주세요.")
    setExisting(result.items);setCandidates(people);setPreviewPage(1);batchId.current=crypto.randomUUID()
  })
  const save=async()=>{
    if(!selected.length||selected.length>rosterLimits.selected||busy)return
    if(!await confirm(`${generation}기 ${selected.length}명을 비공개 초안으로 등록합니다. 목록에서 확인한 뒤 일괄 공개할 수 있습니다.`,{title:"명단 일괄 등록",acceptLabel:`${selected.length}명 초안 등록`,preview:selected.map(c=>`${c.name} · ${c.department} · ${c.year}`).join("\n"),previewLabel:"등록할 명단"}))return
    await run(async()=>{
      setStatus("선택한 명단을 저장하는 중")
      const members=selected.map(({row,name,department,year,roles})=>({row,name:cleanRosterText(name),department:cleanRosterText(department),year,roles}))
      const result=await(await api("/cms/member-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({batchId:batchId.current,generation:Number(generation),group,reviewed:true,members})})).json()
      onComplete(Number(generation),result.created.length,result.skipped.length)
    })
  }
  const edit=(row:number,key:"name"|"department"|"year"|"roles",value:unknown)=>setCandidates(all=>all.map(c=>{
    if(c.row!==row)return c
    const next={...c,[key]:value} as RosterCandidate
    if(key==="name"&&c.error==="이름 확인 필요")next.error=validMemberName(String(value))?"":"이름 확인 필요"
    return next
  }))
  const width=sheet?rosterProfile(sheet,header).length:0
  return <section className="member-import">
    <div className="detail-navigation"><button disabled={busy} onClick={onClose}><ArrowLeft size={15}/>회원 명단으로</button></div>
    <header className="page-heading"><div><h1>엑셀 명단 가져오기</h1><p>파일 선택 → 열 연결 → 명단 확인 → 한꺼번에 등록</p></div><FileSpreadsheet size={25}/></header>
    {error&&<p className="error-panel" role="alert">{error}</p>}
    {note&&<p className="success-panel" role="status">{note}</p>}
    <fieldset className="roster-settings" disabled={busy}>
      <label className="roster-file"><strong>명단 엑셀 파일</strong><input type="file" accept=".xlsx,.csv,.tsv" onChange={e=>{const f=e.target.files?.[0];if(f)void choose(f);e.target.value=""}}/><span>.xlsx · UTF-8 CSV · 최대 2 MB. 파일은 기기에서 읽고, 열의 종류·형식만 Cloudflare AI로 자동 분석합니다.</span></label>
      {sheet&&<>
        <div className="roster-options">
          <label>시트<select value={sheetIndex} onChange={e=>{const i=Number(e.target.value);setSheetIndex(i);configure(sheets[i])}}>{sheets.map((s,i)=><option value={i} key={i}>{s.name}</option>)}</select></label>
          <label>열 제목이 있는 행<input type="number" min={1} max={sheet.rows.length} value={header+1} onChange={e=>{const n=Math.max(0,Math.min(sheet.rows.length-1,Number(e.target.value)-1));configure(sheet,n)}}/></label>
          <label>등록할 기수<input type="number" min={1} max={999} placeholder="예: 41" value={generation} onChange={e=>{setGeneration(e.target.value);resetPreview()}}/></label>
          <label>표시 위치<select value={group} onChange={e=>setGroup(e.target.value)}><option value="members">MEMBERS · 활동 회원</option><option value="alumni">ALUMNI · 수료 회원</option></select></label>
        </div>
        <div className="roster-ai"><div><strong>AI로 열 자동 연결</strong><p>열 제목의 종류와 값의 형식만 Cloudflare AI에 보냅니다. 이름·학과·학번 원문은 보내지 않습니다. AI를 사용할 수 없어도 직접 연결할 수 있습니다.</p></div><button className="secondary" onClick={()=>void analyze()}><WandSparkles size={15}/>AI로 열 연결</button></div>
        <div className="roster-options roster-mapping">{rosterFields.map(field=><label key={field}>{rosterLabels[field]}{field==="name"?" *":""}<select value={mapping[field]??""} onChange={e=>{setMapping(m=>({...m,[field]:e.target.value===""?null:Number(e.target.value)}));resetPreview()}}><option value="">사용 안 함</option>{Array.from({length:width},(_,i)=><option value={i} key={i}>{i+1}열 · {(sheet.rows[header]?.[i]||"제목 없음").slice(0,35)}</option>)}</select></label>)}</div>
        <p className="field-help">기수 열이 없거나 비어 있으면 입력한 기수로 등록합니다. 혼합 기수 명단은 기수 열을 연결하거나 해당 기수만 남긴 파일을 사용하세요. 학번은 연도 두 자리만 저장하며, 사진·수식·숨긴 행·셀 색상은 가져오지 않습니다.</p>
        <details><summary>원본 앞부분 확인 · {filename}</summary><div className="roster-table"><table><thead><tr><th>행</th>{Array.from({length:width},(_,i)=><th key={i}>{i+1}열</th>)}</tr></thead><tbody>{sheet.rows.slice(header,header+6).map((r,i)=><tr key={i}><th>{header+i+1}</th>{Array.from({length:width},(_,j)=><td key={j}>{r[j]??""}</td>)}</tr>)}</tbody></table></div></details>
        <button className="secondary" onClick={()=>void prepare()}>명단 미리보기·중복 확인</button>
      </>}
    </fieldset>
    {candidates.length>0&&<section className="roster-review">
      <header><div><h2>{generation}기 · 등록할 명단 확인</h2><p>{candidates.length}행 중 {selected.length}명 선택 · 중복 {duplicates.size}행 제외</p></div><button className="primary" disabled={busy||!selected.length||selected.length>100} onClick={()=>void save()}>{selected.length}명 초안 등록</button></header>
      {selected.length>100&&<p className="error-panel">한 번에 최대 100명까지 선택할 수 있어요.</p>}
      <p className="field-help">같은 기수의 같은 이름은 기존 명단과 휴지통까지 확인합니다. 동명이인은 기존 명단에서 개별 확인해 주세요. 미수료·탈퇴 표시는 기본 선택에서 제외하며, 등록 전에 값을 직접 수정할 수 있습니다.</p>
      <div className="roster-table"><table><thead><tr><th><input type="checkbox" aria-label="중복·미수료 표시를 제외하고 전체 선택" disabled={busy} checked={candidates.some(bulkEligible)&&candidates.filter(bulkEligible).every(c=>c.selected)} onChange={e=>setCandidates(all=>all.map(c=>({...c,selected:bulkEligible(c)&&e.target.checked})))}/></th><th>원본 행</th><th>이름</th><th>학과</th><th>학번</th><th>직책</th><th>확인 사항</th></tr></thead><tbody>{visible.map(c=><tr key={c.row} className={eligible(c)?"":"roster-excluded"}>
        <td><input type="checkbox" aria-label={`${c.row}행 ${c.name} 선택`} disabled={busy||!eligible(c)} checked={c.selected&&eligible(c)} onChange={e=>setCandidates(all=>all.map(p=>p.row===c.row?{...p,selected:e.target.checked}:p))}/></td><td>{c.row}</td>
        <td><input aria-label={`${c.row}행 이름`} disabled={busy} value={c.name} maxLength={50} onChange={e=>edit(c.row,"name",e.target.value)}/></td>
        <td><input aria-label={`${c.row}행 학과`} disabled={busy} value={c.department} maxLength={100} onChange={e=>edit(c.row,"department",e.target.value)}/></td>
        <td><input className="roster-year" aria-label={`${c.row}행 학번 연도`} disabled={busy} value={c.year} maxLength={2} inputMode="numeric" onChange={e=>edit(c.row,"year",e.target.value.replace(/\D/g,""))}/></td>
        <td><select aria-label={`${c.row}행 직책`} disabled={busy} value={c.roles.join(",")} onChange={e=>edit(c.row,"roles",e.target.value?e.target.value.split(","):[])}><option value="">없음</option>{["회장","부회장","기장","회장,기장","부회장,기장"].map(r=><option key={r} value={r}>{r.replace(","," · ")}</option>)}</select></td>
        <td><span>{duplicates.get(c.row)||c.error||c.note||"등록 가능"}</span></td></tr>)}</tbody></table></div>
      {pageCount>1&&<nav className="roster-pages" aria-label="가져올 명단 페이지">{Array.from({length:pageCount},(_,i)=><button key={i} aria-current={previewPage===i+1?"page":undefined} onClick={()=>setPreviewPage(i+1)}>{i+1}</button>)}</nav>}
    </section>}
    {busy&&<p role="status" aria-live="polite">{status||"처리 중…"}</p>}
  </section>
}
