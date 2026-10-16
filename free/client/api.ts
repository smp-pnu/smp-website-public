import { useEffect, useState } from "react"
import { peekApi, readApi } from "./api-cache"

export function useApi<T>(path: string, ttl = 300_000) {
  // Render a warm list immediately so ScrollRestoration sees its full height
  // and card anchors on the first commit after Back / 목록으로 돌아가기.
  const [state, setState] = useState<{ path: string; value?: T; error?: Error }>(()=>{
    return { path, value: peekApi<T>(path, ttl) }
  })
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
