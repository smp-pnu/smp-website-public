import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import type { DropPlacement } from "./library-model"

type Target = { id: string; placement: DropPlacement }
type Gesture = { id: string; pointer: number; handle: HTMLElement; x: number; y: number; active: boolean }

// Pointer capture makes the preview and insertion marker consistent across
// browsers. Only the final valid drop invokes the server-backed move callback.
export function useListReorder(onMove: (from: string, to: string, placement: DropPlacement) => Promise<void>, canDrop?: (from: string, to: string) => boolean) {
  const table = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const scrollFrame = useRef(0)
  const [dragged, setDragged] = useState("")
  const [target, setTarget] = useState<Target | null>(null)
  const cancel = useCallback(() => {
    const current = gesture.current
    gesture.current = null
    cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = 0
    if (current?.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer)
    setDragged("")
    setTarget(null)
  }, [])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancel() }
    }
    window.addEventListener("keydown", escape)
    window.addEventListener("blur", cancel)
    return () => {
      window.removeEventListener("keydown", escape)
      window.removeEventListener("blur", cancel)
      cancel()
    }
  }, [cancel])
  const targetAtPointer = (): Target | null => {
    const { x, y } = pointer.current
    const row = document.elementFromPoint(x, y)?.closest<HTMLTableRowElement>("tr[data-reorder-id]")
    if (!row || !table.current?.contains(row) || row.dataset.reorderId === gesture.current?.id) return null
    if (canDrop && !canDrop(gesture.current!.id, row.dataset.reorderId!)) return null
    const { top, height } = row.getBoundingClientRect()
    return { id: row.dataset.reorderId!, placement: y < top + height / 2 ? "before" : "after" }
  }
  const updateTarget = () => {
    const next = targetAtPointer()
    setTarget((old) => old?.id === next?.id && old?.placement === next?.placement ? old : next)
  }
  const previewPosition = () => `translate3d(${Math.max(8, Math.min(pointer.current.x + 16, window.innerWidth - 348))}px, ${Math.max(8, Math.min(pointer.current.y + 16, window.innerHeight - 88))}px, 0)`
  const scrollAtEdge = () => {
    scrollFrame.current = 0
    if (!gesture.current?.active) return
    const { x, y } = pointer.current
    const bounds = table.current?.getBoundingClientRect()
    if (!bounds || x < bounds.left || x > bounds.right || y < 0 || y > window.innerHeight) return
    const delta = y < 64 ? -Math.ceil((64 - y) / 4) : y > window.innerHeight - 64 ? Math.ceil((y - window.innerHeight + 64) / 4) : 0
    if (!delta) return
    const previous = window.scrollY
    window.scrollBy({ top: delta, behavior: "instant" })
    updateTarget()
    if (window.scrollY !== previous) scrollFrame.current = requestAnimationFrame(scrollAtEdge)
  }
  const start = (event: PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || event.pointerType === "touch") return
    event.preventDefault()
    pointer.current = { x: event.clientX, y: event.clientY }
    gesture.current = { id, pointer: event.pointerId, handle: event.currentTarget, x: event.clientX, y: event.clientY, active: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointer !== event.pointerId) return
    pointer.current = { x: event.clientX, y: event.clientY }
    if (!current.active) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return
      current.active = true
      setDragged(current.id)
    }
    if (preview.current) preview.current.style.transform = previewPosition()
    updateTarget()
    if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(scrollAtEdge)
  }
  const end = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointer !== event.pointerId) return
    pointer.current = { x: event.clientX, y: event.clientY }
    const drop = current.active ? targetAtPointer() : null
    cancel()
    if (drop) void onMove(current.id, drop.id, drop.placement)
  }
  return { table, preview, dragged, target, cancel, start, move, end, previewPosition }
}
