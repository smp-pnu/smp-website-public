import { createPortal } from "react-dom"
import { FileText, GripVertical } from "lucide-react"
import type { useListReorder } from "./use-list-reorder"
type Reorder = ReturnType<typeof useListReorder>

export function DragHandle({ reorder, id, title, disabled, helpId }: {
  reorder: Reorder; id: string; title: string; disabled: boolean; helpId: string
}) {
  return <span className="drag-handle"
    onPointerDown={(event) => { if (!disabled) reorder.start(event, id) }}
    onPointerMove={reorder.move} onPointerUp={reorder.end}
    onPointerCancel={reorder.cancel} onLostPointerCapture={reorder.cancel}
    aria-describedby={helpId} title={`${title} 순서 변경: 파란 선에 놓기`}>
    <GripVertical size={14} />
  </span>
}

export function DragPreview({ reorder, title, subtitle }: { reorder: Reorder; title: string; subtitle: string }) {
  if (!reorder.dragged) return null
  return createPortal(<div ref={reorder.preview} className="report-drag-preview" style={{ transform: reorder.previewPosition() }} aria-hidden="true">
    <FileText size={22} /><span><strong>{title}</strong><small>{subtitle} · 이동 중</small></span><GripVertical size={16} />
  </div>, document.body)
}
