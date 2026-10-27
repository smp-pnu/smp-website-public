import { api } from "./server-storage"
import { aiPages, mergeAiFields, validateAiCandidates, type AiCandidate } from "./ai-fields"
import type { Evidence, Fields } from "./model"

export async function prefillAi<T extends { fields: Fields; evidence: Evidence[]; warnings: string[]; sourcePages: string[] }>(
  base: T, hash: string, filename: string, signal: AbortSignal, progress: (step: string) => void,
  review: (pages: string[]) => Promise<boolean>,
): Promise<T> {
  const pages = aiPages(base.sourcePages)
  if (!await review(pages)) return base
  signal.throwIfAborted()
  progress("AI로 입력 후보를 확인하는 중")
  try {
    const result = await (await api("/metadata/extract", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hash, pages, reviewed: true }) })).json() as { candidates: AiCandidate[]; warning?: string }
    signal.throwIfAborted()
    // Recheck quoted evidence on the client, too. Never directly spread model
    // properties onto a draft, even if the API response is unexpectedly shaped.
    const candidates = Array.isArray(result.candidates) ? validateAiCandidates(Object.fromEntries(result.candidates.filter(item => item && typeof item.field === "string").map(item => [item.field, item])), pages) : []
    const merged = mergeAiFields(base, candidates, filename)
    if (typeof result.warning === "string") merged.warnings = [...merged.warnings, result.warning.slice(0, 500)].slice(0, 20)
    return { ...base, ...merged }
  } catch {
    signal.throwIfAborted()
    return { ...base, warnings: [...base.warnings, "AI 입력 보완을 사용하지 못해 기본 추출값으로 등록했어요. 빈 항목은 직접 입력해 주세요."].slice(0, 20) }
  }
}
