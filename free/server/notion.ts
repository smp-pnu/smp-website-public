import { upstreamFetch } from "@/lib/upstream-fetch"
import { normalizeId, toContentItem, type NotionPage, type ContentKind } from "../../lib/content-model"
import { singleFlight } from "../../lib/single-flight"
import { notionBudget } from "./budget"
import { Busy, type Env } from "./types"

let backoffUntil = 0
const samePage = singleFlight<ReturnType<typeof toContentItem>>()
export function source(env: Env, kind: ContentKind | "members") {
  const raw = kind === "research" ? env.NOTION_REPORTS_DATA_SOURCE_ID : kind === "notice" ? env.NOTION_NOTICES_DATA_SOURCE_ID : env.NOTION_MEMBERS_DATA_SOURCE_ID
  const id = raw && normalizeId(raw)
  if (!id || !env.NOTION_TOKEN) throw new Error("CMS is not configured")
  return id
}
export async function notion<T>(env: Env, path: string, body?: unknown, method?: "PATCH") {
  if (backoffUntil > Date.now()) throw new Busy(Math.ceil((backoffUntil - Date.now()) / 1000))
  // Shared by every Worker isolate and the single Node publisher.
  await notionBudget(env.CMS_DB)
  const response = await (env.NOTION_FETCH ?? upstreamFetch)(`https://api.notion.com/v1/${path}`, {
    method: method ?? (body ? "POST" : "GET"), headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": "2025-09-03", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(10_000), cache: "no-store",
  })
  if (response.status === 404) { await response.body?.cancel(); return null }
  if (response.status === 429 || response.status >= 500) {
    const seconds = Math.min(3600, Math.max(1, Number(response.headers.get("retry-after")) || 60))
    backoffUntil = Date.now() + seconds * 1000
    await response.body?.cancel()
    await env.CMS_DB.prepare("INSERT INTO free_controls(name,until_at) VALUES ('notion-backoff',?) ON CONFLICT(name) DO UPDATE SET until_at=MAX(until_at,excluded.until_at)").bind(backoffUntil).run()
    throw new Busy(seconds)
  }
  // Workers support manual/follow, not redirect:error. A redirect is rejected
  // with every other non-success response, without forwarding the CMS token.
  if (!response.ok) { await response.body?.cancel(); throw new Error(`CMS unavailable (${response.status})`) }
  return response.json() as Promise<T>
}
export async function published(env: Env, kind: ContentKind, rawId: string) {
  const id = normalizeId(rawId)
  if (!id) return null
  const owner = source(env, kind)
  return samePage(`${owner}:${id}`, async () => {
    const page = await notion<NotionPage>(env, `pages/${id}`)
    if (!page || normalizeId(page.id) !== id || page.parent?.type !== "data_source_id" || normalizeId(page.parent.data_source_id ?? "") !== owner) return null
    return toContentItem(page, kind)
  })
}
