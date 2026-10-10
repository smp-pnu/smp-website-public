// Share the complete cache read/fill/write operation, not just the API fetch.
// Results are discarded immediately after completion; this is not a TTL cache.
export function singleFlight<T>() {
  const pending = new Map<string, Promise<T>>()
  return async (key: string, work: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key)
    if (existing) return existing
    const task = Promise.resolve().then(work)
    pending.set(key, task)
    try { return await task }
    finally { if (pending.get(key) === task) pending.delete(key) }
  }
}
