import "server-only"

type ListResponse<T> = { results: T[]; has_more: boolean; next_cursor: string | null }

// Both database queries and block reads use the same cursor checks. A repeated
// cursor must fail instead of making unbounded calls to Notion.
export async function* notionPages<T>(path: string, body?: Record<string, unknown>) {
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const response: ListResponse<T> = body
      ? await notionRequest(path, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
      : await notionRequest(`${path}?${new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) })}`)
    if (response.has_more && (!response.next_cursor || cursors.has(response.next_cursor))) {
      throw new Error("Invalid Notion pagination")
    }
    yield response.results
    cursor = response.has_more ? response.next_cursor : null
    if (cursor) cursors.add(cursor)
  } while (cursor)
}

export async function notionRequest<T>(path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      // Revoked publications and expiring file URLs must not persist in a cache.
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return response.json() as Promise<T>
    await response.body?.cancel()
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retry = Number(response.headers.get("retry-after") ?? 1)
      await new Promise(resolve => setTimeout(resolve, Math.min(3, Math.max(1, Number.isFinite(retry) ? retry : 1)) * 1000))
      continue
    }
    // Do not include Notion response bodies, content or secrets in logs/errors.
    throw new Error(`Notion API returned ${response.status}`)
  }
  throw new Error("Notion API unavailable")
}
