import { useCallback, useEffect, useRef, useState } from "react"
import { listDrafts, insertDraft, mutateDraft, readAssets, readCover } from "./storage"
import { cloudMode, serverMode, storageLabel } from "./mode"
import { prefillAi } from "./ai-prefill"
import { adminError } from "./errors"
import { checkCapacity, limits, type Draft, type Fields, type DraftCommand } from "./model"

export function useLab() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState("")
  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    const all = await listDrafts()
    if (alive.current) setDrafts(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    return all
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh().catch(error => setErrors([String(error.message)])).finally(() => setLoading(false))
    // Do not replace an open editor on focus: another tab may have changed its
    // revision while this tab still holds unsaved edits. Writes detect conflicts.
    return () => { alive.current = false; controller.current?.abort() }
  }, [refresh])

  const ingest = async (files: File[]) => {
    if (controller.current) return
    if (!files.length) return
    if (files.length > limits.batch) { setErrors(["한 번에 최대 5개까지 추가할 수 있어요. 선택한 파일 수를 줄여 주세요."]); return }
    const run = new AbortController()
    controller.current = run
    setErrors([]); setMessage(""); setProgress("PDF 분석기를 준비하는 중")
    const failed: string[] = []
    let added = 0; let reused = 0
    try {
      const { fingerprint, analyzePdf } = await import("./pdf")
      for (const [index, file] of files.entries()) {
        if (run.signal.aborted) break
        const label = (step: string) => { if (alive.current) setProgress(`${index + 1}/${files.length} · ${file.name} · ${step}`) }
        try {
          label("파일 확인 중")
          const { hash, bytes } = await fingerprint(file, run.signal)
          const current = await listDrafts()
          const duplicate = current.find(item => item.hash === hash)
          if (duplicate) { reused++; setSelected(duplicate.id); if (duplicate.trashedAt) failed.push(`${file.name}: 같은 파일이 휴지통에 있어요. 복원해 주세요.`); continue }
          checkCapacity(current, file.size)
          const extracted = await analyzePdf(file.name, bytes, run.signal, label)
          const analysis = cloudMode ? await prefillAi(extracted, hash, file.name, run.signal, label) : extracted
          run.signal.throwIfAborted()
          const now = new Date().toISOString()
          const draft: Draft = {
            id: crypto.randomUUID(), hash, filename: file.name, fileBytes: file.size, storedBytes: file.size + analysis.cover.size,
            pages: analysis.pages, fields: analysis.fields, evidence: analysis.evidence, warnings: analysis.warnings,
            revision: 1, approvedRevision: null, approvedAt: null, updatedAt: now, createdAt: now, trashedAt: null,
          }
          label(`${storageLabel}에 저장 중`)
          const saved = await insertDraft(draft, { id: draft.id, pdf: file, cover: analysis.cover }, run.signal, label)
          if (serverMode || saved.id === draft.id) added++; else reused++
          await refresh(); setSelected(saved.id)
        } catch (error) {
          if (!run.signal.aborted) failed.push(`${file.name}: ${adminError(error)}`)
        }
      }
      if (alive.current) {
        setMessage([added ? `${added}개 초안을 준비했어요.` : "", reused ? `같은 PDF ${reused}개는 기존 초안을 재사용했어요.` : "", run.signal.aborted ? "취소했어요. 이미 저장된 초안은 유지돼요." : ""].filter(Boolean).join(" "))
        setErrors(failed)
      }
    } catch (error) { if (alive.current) setErrors([adminError(error)]) }
    finally { controller.current = null; if (alive.current) setProgress("") }
  }

  const change = async (draft: Draft, command: DraftCommand, success: string) => {
    await mutateDraft(draft.id, draft.revision, command)
    await refresh(); setMessage(success)
  }
  const reanalyze = async (draft: Draft) => {
    if (controller.current) throw Error("현재 PDF 준비가 끝나면 다시 시도해 주세요.")
    const run = new AbortController()
    controller.current = run
    setErrors([]); setProgress("저장된 PDF에서 입력 후보를 다시 찾는 중")
    try {
      const assets = await readAssets(draft.id)
      if (!assets) throw Error("저장된 원본 PDF를 찾지 못했어요.")
      const { analyzePdf } = await import("./pdf")
      const extracted = await analyzePdf(draft.filename, new Uint8Array(await assets.pdf.arrayBuffer()), run.signal, setProgress, assets.cover)
      const result = cloudMode ? await prefillAi(extracted, draft.hash, draft.filename, run.signal, setProgress) : extracted
      run.signal.throwIfAborted()
      await change(draft, { type: "reanalyze", fields: result.fields, evidence: result.evidence, warnings: result.warnings }, "입력 후보를 다시 준비했어요. 표지와 PDF는 그대로 재사용했어요.")
    } catch (error) { throw new Error(adminError(error)) }
    finally { controller.current = null; setProgress("") }
  }
  return { drafts, selected, setSelected, loading, progress, message, errors, refresh, ingest,
    reanalyze,
    cancel: () => controller.current?.abort(),
    save: (draft: Draft, fields: Fields) => change(draft, { type: "edit", fields }, `초안을 ${storageLabel}에 저장했어요.`),
    approve: (draft: Draft, reviewed: boolean) => change(draft, { type: "approve", reviewed }, "시험 승인했어요. 운영 사이트에는 게시되지 않아요."),
    trash: (draft: Draft, trashed: boolean) => change(draft, { type: "trash", trashed }, trashed ? "시험 초안을 휴지통으로 옮겼어요." : "검토 대기 상태로 복원했어요."),
    remove: (draft: Draft) => change(draft, { type: "remove" }, `${storageLabel}에서 PDF와 초안을 삭제했어요.`),
  }
}

export function useCover(id: string) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    let active = true
    let objectUrl = ""
    setUrl("")
    void readCover(id).then(cover => {
      if (active && cover) { objectUrl = URL.createObjectURL(cover); setUrl(objectUrl) }
    }).catch(() => {})
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  return url
}

export async function downloadOriginal(draft: Draft) {
  const assets = await readAssets(draft.id)
  if (!assets) throw Error(`${storageLabel}에 원본 파일이 없어요.`)
  const url = URL.createObjectURL(assets.pdf)
  const a = document.createElement("a")
  a.href = url; a.download = draft.filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
