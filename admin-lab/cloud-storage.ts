import { api, ApiConnectionError } from "./server-storage"
import type { Assets, Draft } from "./model"
import { chunkBytes, fileIdentity, sha256 } from "../admin-cloud/protocol"
export { listDrafts, readCover, mutateDraft } from "./server-storage"
function pause(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted()
    const finish = () => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }
    const timer = setTimeout(finish, 750)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", abort, { once: true })
  })
}
export async function insertDraft(
  draft: Draft,
  assets: Assets,
  signal?: AbortSignal,
  progress?: (step: string) => void,
  replace?: { id: string; revision: number },
): Promise<Draft> {
  // These upload endpoints are idempotent. Share two retries across the whole
  // file, rather than multiplying requests for every chunk or other mutations.
  let retries = 0
  const rawSha256 = await sha256(new Uint8Array(await assets.pdf.arrayBuffer()))
  const request = async <T>(step: string, run: () => Promise<T>): Promise<T> => {
    while (true) {
      signal?.throwIfAborted()
      progress?.(step)
      try {
        return await run()
      } catch (error) {
        signal?.throwIfAborted()
        if ((error instanceof ApiConnectionError || error instanceof TypeError) && retries < 2) {
          retries++
          progress?.(`${step} · 연결 재시도 ${retries}/2`)
          await pause(signal)
          continue
        }
        throw Error(
          `${step}: ${error instanceof TypeError ? new ApiConnectionError().message : error instanceof Error ? error.message : "저장하지 못했어요."}`,
        )
      }
    }
  }
  const started = await request("업로드 시작", async () =>
    (
      await api("/uploads", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hash: draft.hash,
          rawSha256,
          filename: draft.filename,
          fileBytes: assets.pdf.size,
          coverBytes: assets.cover.size,
          pages: draft.pages,
          fields: draft.fields,
          evidence: draft.evidence,
          warnings: draft.warnings,
          replace,
        }),
      })
    ).json(),
  )
  if (started.draft) return started.draft
  const id = encodeURIComponent(started.id)
  try {
    for (const [kind, blob] of [
      ["pdf", assets.pdf],
      ["cover", assets.cover],
    ] as const) {
      for (let offset = 0; offset < blob.size; offset += chunkBytes) {
        signal?.throwIfAborted()
        // Materialize only one bounded chunk. This avoids Safari's disk-backed
        // File/Blob upload path and retains exactly the same bytes on a retry.
        const body = await blob.slice(offset, offset + chunkBytes).arrayBuffer()
        const step = `${kind === "pdf" ? "PDF" : "표지"} 전송 ${offset / chunkBytes + 1}/${Math.ceil(blob.size / chunkBytes)}`
        await request(step, () =>
          api(`/uploads/${id}/${kind}/${offset / chunkBytes}`, {
            method: "PUT",
            body,
            signal,
            headers: { "Content-Type": "application/octet-stream" },
          }),
        )
      }
    }
    return await request("저장 확인", async () =>
      (await api(`/uploads/${id}/finish`, { method: "POST", signal })).json(),
    )
  } catch (e) {
    // Explicit cancellation only. Network failures keep the 30-minute staging
    // record so the same source can resume instead of creating another Drive file.
    if (signal?.aborted)
      await api(`/uploads/${id}`, { method: "DELETE", signal: AbortSignal.timeout(5000) }).catch(
        () => {},
      )
    throw e
  }
}
export async function readAssets(id: string, approved = false): Promise<Assets> {
  const url = `/drafts/${encodeURIComponent(id)}${approved ? "/release" : ""}`
  const manifest = await (await api(`${url}/pdf`)).json()
  if (
    !Number.isInteger(manifest.parts) ||
    manifest.parts < 1 ||
    manifest.parts > 128 ||
    !Number.isInteger(manifest.bytes) ||
    manifest.bytes > 32 * 1024 * 1024
  )
    throw Error("원본 파일 정보를 확인하지 못했어요.")
  const parts: Blob[] = new Array(manifest.parts)
  // Three bounded parallel requests, only after the administrator requests the PDF.
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(3, manifest.parts) }, async () => {
      while (next < manifest.parts) {
        const index = next++
        parts[index] = await (await api(`${url}/pdf/${index}`)).blob()
      }
    }),
  )
  const pdf = new Blob(parts, { type: "application/pdf" })
  if (
    pdf.size !== manifest.bytes ||
    (await fileIdentity(new Uint8Array(await pdf.arrayBuffer()))) !== manifest.hash
  )
    throw Error("내려받은 PDF 검증에 실패했어요. 다시 시도해 주세요.")
  return { id, pdf, cover: await (await api(`${url}/cover`)).blob() }
}
