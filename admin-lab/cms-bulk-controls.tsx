import {useEffect, useRef} from "react"
import type {Entry} from "../cms/model"
import {actionLabels, canApply, selectionLimit, type BatchProgress, type CmsAction} from "./cms-bulk"

export function PageSelection({count,total,disabled,onChange}:{count:number;total:number;disabled:boolean;onChange:(checked:boolean)=>void}) {
  const checkbox = useRef<HTMLInputElement>(null)
  useEffect(()=>{if(checkbox.current)checkbox.current.indeterminate=count>0 && count<total},[count,total])
  return <input ref={checkbox} type="checkbox" aria-label="현재 페이지 전체 선택"
    checked={total>0 && count===total} disabled={disabled || !total} onChange={e=>onChange(e.target.checked)} />
}

export function CmsBulkControls({entries,visibleCount,trash,disabled,progress,stopping,onAction,onClear,onStop}:{
  entries:Entry[];visibleCount:number;trash:boolean;disabled:boolean;progress:BatchProgress|null;stopping:boolean;
  onAction:(action:CmsAction)=>void;onClear:()=>void;onStop:()=>void
}) {
  if (!entries.length) return <p className="cms-selection-hint">체크박스로 여러 자료를 선택해 한 번에 처리할 수 있습니다. 최대 {selectionLimit}개까지 선택할 수 있습니다.</p>
  const actions:CmsAction[] = trash ? ["restore"] : ["approve","withdraw","trash"]
  return <div className="cms-bulk-bar" role="region" aria-label="선택 자료 일괄 작업">
    <div className="cms-selection-count"><strong>{entries.length}개 선택</strong><span>현재 페이지 {visibleCount}개 · 페이지를 옮겨도 선택 유지</span></div>
    {progress ? <>
      <span role="status">{stopping ? "현재 항목 처리 후 중지합니다" : "처리 중"} · {progress.processed} / {progress.total}</span>
      <progress max={progress.total || 1} value={progress.processed} aria-label="일괄 처리 진행률" />
      <button disabled={stopping} onClick={onStop}>중지</button>
    </> : <div className="cms-actions">
      {actions.map(action=><button key={action} className={action==="trash"?"danger":"secondary"}
        disabled={disabled || !entries.some(e=>canApply(e,action))} onClick={()=>onAction(action)}>선택 {actionLabels[action]}</button>)}
      <button className="text-button" disabled={disabled} onClick={onClear}>선택 해제</button>
    </div>}
  </div>
}
