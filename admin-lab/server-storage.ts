import type { Assets, Draft, DraftCommand } from "./model"
let csrf = ""
export type Session = { username: string; csrf: string }
export function setApiSession(session: Session | null) { csrf = session?.csrf ?? "" }
export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrf)
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: "same-origin", cache: "no-store", signal: options.signal ?? AbortSignal.timeout(45_000) })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    if (response.status === 401 && !["/login", "/setup"].includes(path)) { setApiSession(null); window.dispatchEvent(new Event("admin-session-expired")) }
    throw Error(data.error ?? "시험 서버에 연결하지 못했어요.")
  }
  return response
}
export const listDrafts = async (): Promise<Draft[]> => (await api("/drafts")).json()
export const readCover = async (id: string) => (await api(`/drafts/${encodeURIComponent(id)}/cover`)).blob()
export const readAssets = async (id: string): Promise<Assets> => {
  const [pdf, cover] = await Promise.all([api(`/drafts/${encodeURIComponent(id)}/pdf`).then(r => r.blob()), readCover(id)])
  return { id, pdf, cover }
}
export const insertDraft = async (draft: Draft, assets: Assets, signal?: AbortSignal): Promise<Draft> => {
  const body = new FormData()
  body.set("metadata", JSON.stringify({ filename: draft.filename, fields: draft.fields, evidence: draft.evidence, warnings: draft.warnings }))
  body.set("pdf", assets.pdf, draft.filename); body.set("cover", assets.cover, "cover.webp")
  return (await api("/drafts", { method: "POST", body, signal })).json()
}
export const mutateDraft = async (id: string, revision: number, command: DraftCommand) => {
  await api(`/drafts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, command }) })
}
