import "server-only"
import { createHash } from "node:crypto"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { normalizeId, type NotionPage } from "./content-model"
import { notionPages } from "./notion-request"
import { sortMembers, toMember, type Member, type MemberResult } from "./member-model"
import { singleFlight } from "./single-flight"

export const memberCacheTag = "smp-published-members-v1"
const pending = new Map<string, Promise<MemberResult>>()

function namespace() {
  return createHash("sha256").update(JSON.stringify([process.env.NOTION_TOKEN, process.env.NOTION_MEMBERS_DATA_SOURCE_ID])).digest("hex")
}

export async function loadMembers(): Promise<MemberResult> {
  const key = namespace()
  const existing = pending.get(key)
  if (existing) return existing
  const work = queryMembers()
  pending.set(key, work)
  try { return await work } finally { if (pending.get(key) === work) pending.delete(key) }
}

async function queryMembers(): Promise<MemberResult> {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBERS_DATA_SOURCE_ID) return { items: [], state: "unconfigured" }
  try {
    const source = normalizeId(process.env.NOTION_MEMBERS_DATA_SOURCE_ID.trim())
    if (!source) throw new Error("Invalid member data source")
    const items = new Map<string, Member>()
    for await (const batch of notionPages<NotionPage>(`data_sources/${source}/query`, {
      filter: { property: "공개", checkbox: { equals: true } },
    })) {
      for (const page of batch) {
        const member = toMember(page, source)
        if (member) items.set(member.id, member)
      }
    }
    return { items: sortMembers([...items.values()]), state: "ready" }
  } catch (error) {
    console.error("[SMP CMS] members:", error instanceof Error ? error.message : "Request failed")
    return { items: [], state: "error" }
  }
}

const cachedMembers = unstable_cache(async (_namespace: string) => {
  const result = await loadMembers()
  if (result.state === "error") throw new Error("Member catalogue unavailable")
  return { result, fetchedAt: Date.now() }
}, ["member-catalog-v2"], { revalidate: 60, tags: [memberCacheTag] })

const memberFlight = singleFlight<MemberResult>()
export const getMembers = cache(async (): Promise<MemberResult> => memberFlight(namespace(), async () => {
  try {
    const snapshot = await cachedMembers(namespace())
    // A withdrawn profile must not remain public through an extended outage.
    if (Date.now() - snapshot.fetchedAt > 120_000) return loadMembers()
    return snapshot.result
  } catch { return { items: [], state: "error" } }
}))
