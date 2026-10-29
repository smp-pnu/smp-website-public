import { useState } from "react"
import { Trash2 } from "lucide-react"
import type { TrashItem } from "../cms/trash"
import { api } from "./server-storage"
import { useConfirmation } from "./confirm"
import { InlineLoading } from "./ui/loading"

export function TrashCleanup({count,onComplete}:{count:number;onComplete:()=>void}) {
  const confirm=useConfirmation(),[busy,setBusy]=useState(false),[message,setMessage]=useState("")
  const clean=async()=>{
    setBusy(true);setMessage("")
    let removed=0,failed=0,retained=0
    try{
      const preview:{total:number;items:TrashItem[]}=await(await api('/dashboard/trash')).json()
      if(!preview.items.length){setMessage("휴지통이 비어 있습니다.");onComplete();return}
      const accepted=await confirm(
        `휴지통의 자료 ${preview.items.length}개와 해당 수정 이력을 영구 삭제합니다. 관리자에서 복원할 수 없습니다. 다른 글에서 사용하는 파일과 기존 Drive 원본은 보존하며, 관리자에 업로드한 PDF는 30일 보류 후 정리합니다.`,
        {title:"사이트 휴지통을 비울까요?",preview:preview.items.map(item=>item.title).join('\n'),previewLabel:"영구 삭제할 자료",acceptLabel:`${preview.items.length}개 영구 삭제`,cancelLabel:"취소"})
      if(!accepted)return
      for(const item of preview.items){
        try{const result=await(await api('/dashboard/trash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id,revision:item.revision,confirm:'permanent-delete'})})).json();if(result.removed)removed++;if(result.cleanupPending)retained++}
        catch(error){failed++;if((error as {status?:number}).status!==409)break}
        setMessage(`${removed}개 정리 · ${failed}개 확인 필요`)
      }
      setMessage(`${removed}개를 정리했습니다.${failed?' 변경되었거나 처리하지 못한 자료는 보존했습니다.':''}${retained?' PDF 보관 상태는 파일 저장소에서 확인해 주세요.':''}${preview.total>preview.items.length?' 나머지는 다시 비워 주세요.':''}`)
      onComplete()
    }catch(error){setMessage((error as Error).message)}finally{setBusy(false)}
  }
  return <div className="ops-trash-cleanup">
    <button className="ops-text-button" disabled={busy||count===0} onClick={()=>void clean()}>
      {busy?<InlineLoading>정리 중…</InlineLoading>:<><Trash2 size={14}/> 사이트 휴지통 비우기</>}
    </button>
    <p className="ops-footnote">삭제 대상 확인 후 게시 자료·이력을 정리합니다. Cloudflare에 저장된 사이트 휴지통이며, Google 휴지통과 별개입니다.</p>
    {message&&<p className="ops-footnote" role="status">{message}</p>}
  </div>
}
