import type {Entry} from "../cms/model"

export type CmsAction = "approve" | "withdraw" | "trash" | "restore"
export const selectionLimit = 100
export const entryTitle = (e:Entry) => "name" in e.draft.item ? e.draft.item.name : e.draft.item.title
export const actionLabels:Record<CmsAction,string> = {approve:"공개",withdraw:"비공개",trash:"삭제",restore:"복원"}
export const canApply = (e:Entry, action:CmsAction) => action === "restore" ? !!e.trashedAt
  : !e.trashedAt && (action === "trash" || (action === "withdraw" ? e.approvedRevision !== null || e.pending
    : (!e.pending || !!e.error) && (e.approvedRevision !== e.revision || !!e.error)))

export function selectEntries(selected:Entry[], entries:Entry[], checked:boolean) {
  const ids = new Set(entries.map(e=>e.id))
  const next = selected.filter(e=>!ids.has(e.id))
  if (checked) next.push(...new Map(entries.map(e=>[e.id,e])).values())
  if (next.length > selectionLimit) throw Error(`한 번에 ${selectionLimit}개까지 선택할 수 있어요. 나누어 처리해 주세요.`)
  return next
}
export type BatchProgress = {processed:number; total:number}
export type BatchResult = {completed:string[]; pending:number; failures:{id:string;title:string;message:string}[]; remaining:string[]}

// Reuse the existing authenticated, revision-checked endpoint for each entry.
// Sequential requests keep one large selection out of a single Worker CPU budget.
// Never automatically retry a mutation whose response may have been lost.
export async function runCmsBatch(entries:Entry[], action:CmsAction,
  send:(entry:Entry, action:CmsAction)=>Promise<Entry>,
  progress:(value:BatchProgress)=>void, stopped:()=>boolean = ()=>false):Promise<BatchResult> {
  if (entries.length > selectionLimit || new Set(entries.map(e=>e.id)).size !== entries.length) throw Error("선택한 자료를 다시 확인해 주세요.")
  const targets = entries.filter(e=>canApply(e,action))
  const result:BatchResult = {completed:[],pending:0,failures:[],remaining:[]}
  let processed = 0
  progress({processed,total:targets.length})
  for (const entry of targets) {
    if (stopped()) break
    let stop = false
    try {
      const updated = await send(entry,action)
      const applied = action === "approve" ? updated.pending || updated.approvedRevision === entry.revision
        : action === "trash" ? !!updated.trashedAt
        : action === "restore" ? !updated.trashedAt && updated.approvedRevision === null
        : updated.approvedRevision === null && !updated.pending
      if (updated.id !== entry.id || !applied) throw Error("처리 결과를 확인하지 못했어요. 목록을 새로고침해 주세요.")
      result.completed.push(entry.id)
      if (action === "approve" && updated.pending) result.pending++
    } catch (error) {
      result.failures.push({id:entry.id,title:entryTitle(entry),message:error instanceof Error ? error.message : "처리하지 못했어요."})
      // Validation/conflict errors concern one row. Authentication, quotas,
      // server errors and uncertain network outcomes stop all further writes.
      stop = ![400,404,409,422].includes((error as {status?:number})?.status ?? 0)
    }
    progress({processed:++processed,total:targets.length})
    if (stop) break
  }
  result.remaining = targets.slice(processed).map(e=>e.id)
  return result
}
