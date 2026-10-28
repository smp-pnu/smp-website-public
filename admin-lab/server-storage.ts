import type { Assets, Draft, DraftCommand } from "./model"
let csrf = ""
export type Session = { username: string; csrf: string }
export function setApiSession(session: Session | null) { csrf = session?.csrf ?? "" }
export class ApiConnectionError extends Error {
  constructor(message = "서버 연결이 끊겼어요. 인터넷 연결을 확인하고 다시 시도해 주세요.") { super(message); this.name = "ApiConnectionError" }
}
export class ApiResponseError extends Error {
  constructor(message:string, readonly status:number) { super(message); this.name="ApiResponseError" }
}
export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  if (options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrf)
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 45_000)
  options.signal?.addEventListener("abort", abort, { once: true })
  let response: Response
  try {
    options.signal?.throwIfAborted()
    response = await fetch(`/api${path}`, { ...options, headers, credentials: "same-origin", cache: "no-store", signal: controller.signal })
  } catch (error) {
    options.signal?.throwIfAborted()
    if (controller.signal.aborted) throw new ApiConnectionError("서버 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.")
    if (error instanceof TypeError) throw new ApiConnectionError()
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", abort)
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    if (response.status === 401 && !["/login", "/setup"].includes(path)) { setApiSession(null); window.dispatchEvent(new Event("admin-session-expired")) }
    throw new ApiResponseError(data.error ?? "시험 서버에 연결하지 못했어요.",response.status)
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
