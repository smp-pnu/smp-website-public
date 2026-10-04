import "server-only"

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

