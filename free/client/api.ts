import { useEffect, useState } from "react"

type Cached = { value: unknown; until: number }
const cache = new Map<string, Cached>()
const paused=new Map<string,{until:number;error:ApiError}>()
const pending = new Map<string, Promise<unknown>>()
export class ApiError extends Error {
  constructor(public status: number, public retryAfter: number) { super(status === 404 ? "게시글이 없거나 비공개 상태입니다." : status === 429 ? "접속이 많아 잠시 대기 중입니다. 잠시 후 다시 시도해주세요." : "자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.") }
}
export async function readApi<T>(path: string, ttl = 300_000): Promise<T> {
  const pause=paused.get(path)
  if(pause && pause.until>Date.now()) throw pause.error
  paused.delete(path)
  const previous = cache.get(path)
  if (previous && previous.until > Date.now()) return previous.value as T
  const active = pending.get(path)
  if (active) return active as Promise<T>
  const work = (async () => {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20_000) })
    if (!response.ok) {
      const error=new ApiError(response.status,Number(response.headers.get("retry-after"))||60)
      if(response.status===429) paused.set(path,{until:Date.now()+Math.max(1,error.retryAfter)*1000,error})
      throw error
    }
    const value = await response.json()
    if (ttl) {
      if (cache.size >= 12) cache.delete(cache.keys().next().value!)
      cache.set(path, { value, until: Date.now() + ttl })
    }
    return value
  })()
  pending.set(path, work)
  try { return await work } finally { pending.delete(path) }
}

export function useApi<T>(path: string, ttl = 300_000) {
  const [state, setState] = useState<{ path: string; value?: T; error?: Error }>({ path })
  useEffect(() => {
    let active = true
    const load = () => { void readApi<T>(path, ttl).then(value => { if (active) setState({ path, value }) }, error => { if (active) setState({ path, error }) }) }
    load()
    // Lists are already filtered in memory. An idle tab needs no minute poll.
    const tick = () => { if (document.visibilityState === "visible") load() }
    const interval = ttl ? setInterval(tick, 600_000) : undefined
    if (ttl) window.addEventListener("focus", tick)
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", tick) }
  }, [path, ttl])
  return state.path === path ? state : { path }
}
