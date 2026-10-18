// Shared by search suggestions and routed content; one bounded browser cache.
export const SEARCH_CACHE_TTL = 60_000
type Cached = { value: unknown; until: number }
const cache = new Map<string, Cached>()
const paused=new Map<string,{until:number;error:ApiError}>()
const pending = new Map<string, Promise<unknown>>()
// The initial HTML already passed the same live publication check as the API.
// Consume it once and briefly; later visits still recheck current visibility.
let initial:{path:string;value:unknown;until:number}|undefined
if(typeof document!=="undefined") {
  const element=document.getElementById("smp-initial-data")
  if(element) {try {const value=JSON.parse(element.textContent??"");if(typeof value.path==="string"&&value.path.startsWith("/api/")) initial={...value,until:Date.now()+10_000}} catch {} element.remove()}
}
export class ApiError extends Error {
  constructor(public status: number, public retryAfter: number) { super(status === 404 ? "게시글이 없거나 비공개 상태입니다." : status === 429 ? "접속이 많아 잠시 대기 중입니다. 잠시 후 다시 시도해주세요." : "자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.") }
}
export async function readApi<T>(path: string, ttl = 300_000): Promise<T> {
  if(initial?.path===path) {
    const value=initial;initial=undefined
    if(value.until>Date.now()) {if(ttl) cache.set(path,{value:value.value,until:Date.now()+ttl});return value.value as T}
  }
  const pause=paused.get(path)
  if(pause && pause.until>Date.now()) throw pause.error
  paused.delete(path)
  const previous = ttl ? cache.get(path) : undefined
  if (previous && previous.until > Date.now()) return previous.value as T
  const active = pending.get(path)
  if (active) return active as Promise<T>
  const work = (async () => {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000) })
    if (!response.ok) {
      const error=new ApiError(response.status,Number(response.headers.get("retry-after"))||60)
      if(response.status===429) paused.set(path,{until:Date.now()+Math.max(1,error.retryAfter)*1000,error})
      // A withdrawn article must not reappear from an older list/search cache.
      const withdrawn = /^(?:\/api\/detail)\/(research|notice)\/[a-f\d-]{32,36}$/.exec(path)
      if ((response.status === 404 || response.status === 403) && withdrawn) {
        for (const key of [`/api/catalog/${withdrawn[1]}`, "/api/search"]) {
          cache.delete(key)
          if (initial?.path === key) initial = undefined
        }
      }
      throw error
    }
    const value = await response.json()
    if (ttl && value?.partial !== true) {
      if (cache.size >= 12) cache.delete(cache.keys().next().value!)
      cache.set(path, { value, until: Date.now() + ttl })
    }
    return value
  })()
  pending.set(path, work)
  try { return await work } finally { pending.delete(path) }
}

/** Read only an existing, unexpired response. Never fetch or extend its lifetime. */
export function peekApi<T>(path: string, ttl = 300_000): T | undefined {
  const saved = initial?.path === path ? initial : ttl ? cache.get(path) : undefined
  return saved && saved.until > Date.now() ? saved.value as T : undefined
}
