import "server-only"
import { createHash } from "node:crypto"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getContentBlocks, loadContent, type ContentResult } from "./notion"
import type { ContentItem, ContentKind } from "./content-model"

export const contentCacheTag = "smp-published-content-v1"

function namespace() {
  return createHash("sha256").update(JSON.stringify([process.env.NOTION_TOKEN,
    process.env.NOTION_NOTICES_DATA_SOURCE_ID, process.env.NOTION_REPORTS_DATA_SOURCE_ID])).digest("hex")
}

const cachedCatalog = unstable_cache(async (kind: ContentKind, _namespace: string) => {
  const result = await loadContent(kind)
  if (result.state === "error") throw new Error("Content catalogue unavailable")
  return { result, fetchedAt: Date.now() }
}, ["published-catalog-semester-v2"], { revalidate: 60, tags: [contentCacheTag] })

export const getContent = cache(async (kind: ContentKind): Promise<ContentResult> => {
  try {
    const snapshot = await cachedCatalog(kind, namespace())
    // Bound stale publication metadata even when background revalidation fails.
    if (Date.now() - snapshot.fetchedAt > 120_000) return loadContent(kind)
    return snapshot.result
  } catch {
    return { items: [], state: "error" }
  }
})

const cachedBlocks = unstable_cache(async (id: string, _revision: string, _namespace: string) => {
  return { blocks: await getContentBlocks(id), fetchedAt: Date.now() }
}, ["published-body-v1"], { revalidate: 60, tags: [contentCacheTag] })

// Call only AFTER a fresh, source-scoped publication check. Private pages and
// their files never become accessible merely because a list/body is cached.
export async function getPublishedBlocks(item: ContentItem) {
  const snapshot = await cachedBlocks(item.id, item.editedAt ?? "", namespace())
  return Date.now() - snapshot.fetchedAt > 120_000 ? getContentBlocks(item.id) : snapshot.blocks
}
