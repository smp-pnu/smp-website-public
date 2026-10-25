import { api } from "./server-storage"
import type { Assets, Draft } from "./model"
import { chunkBytes, fileIdentity } from "../admin-cloud/protocol"
export { listDrafts, readCover, mutateDraft } from "./server-storage"
export async function insertDraft(draft: Draft, assets: Assets, signal?: AbortSignal): Promise<Draft> {
  const started = await (await api("/uploads", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    hash: draft.hash, filename: draft.filename, fileBytes: assets.pdf.size, coverBytes: assets.cover.size, pages: draft.pages,
    fields: draft.fields, evidence: draft.evidence, warnings: draft.warnings,
  }) })).json()
  if (started.draft) return started.draft
  const id = encodeURIComponent(started.id)
  try {
    for (const [kind, blob] of [["pdf", assets.pdf], ["cover", assets.cover]] as const) {
      for (let offset = 0; offset < blob.size; offset += chunkBytes) {
        signal?.throwIfAborted()
        await api(`/uploads/${id}/${kind}/${offset / chunkBytes}`, { method: "PUT", body: blob.slice(offset, offset + chunkBytes), signal, headers: { "Content-Type": "application/octet-stream" } })
      }
    }
    return (await api(`/uploads/${id}/finish`, { method: "POST", signal })).json()
  } catch (e) {
    // Best effort cancellation. A failed cleanup is covered by a bounded staging TTL.
    await api(`/uploads/${id}`, { method: "DELETE", signal: AbortSignal.timeout(5000) }).catch(() => {})
    throw e
  }
}
export async function readAssets(id: string): Promise<Assets> {
  const url = `/drafts/${encodeURIComponent(id)}`
  const manifest = await (await api(`${url}/pdf`)).json()
  if (!Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 128 || !Number.isInteger(manifest.bytes) || manifest.bytes > 32 * 1024 * 1024) throw Error("원본 파일 정보를 확인하지 못했어요.")
  const parts: Blob[] = new Array(manifest.parts)
  // Three bounded parallel requests, only after the administrator requests the PDF.
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, manifest.parts) }, async () => {
    while (next < manifest.parts) { const index = next++; parts[index] = await (await api(`${url}/pdf/${index}`)).blob() }
  }))
  const pdf = new Blob(parts, { type: "application/pdf" })
  if (pdf.size !== manifest.bytes || await fileIdentity(new Uint8Array(await pdf.arrayBuffer())) !== manifest.hash) throw Error("내려받은 PDF 검증에 실패했어요. 다시 시도해 주세요.")
  return { id, pdf, cover: await (await api(`${url}/cover`)).blob() }
}
