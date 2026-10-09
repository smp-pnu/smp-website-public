import { normalizeId } from "../../lib/content-model"
import { limitedBody } from "../../lib/webhook-security"
import { spend } from "./budget"
import { published } from "./notion"
import { rebuildDocuments } from "./catalog"
import type { Env } from "./types"
const json = (body: unknown, status = 200) => Response.json(body, { status })
export async function internal(request: Request, env: Env) {
  const path = new URL(request.url).pathname
  if (path === "/api/internal/status" && request.method === "GET") {
    const [sync, queue, budget] = await Promise.all([
      env.CMS_DB.prepare("SELECT kind,checked_at FROM free_sync").all(),
      env.CMS_DB.prepare("SELECT COUNT(*) AS pending, SUM(attempts>=5) AS failed FROM free_jobs").first(),
      env.CMS_DB.prepare("SELECT key,count,expires_at FROM free_budget WHERE expires_at > ?").bind(Date.now()).all(),
    ])
    return json({ sync: sync.results, queue, budget: budget.results })
  }
  if (path === "/api/internal/jobs/claim" && request.method === "POST") {
    const token = crypto.randomUUID()
    const row = await env.CMS_DB.prepare(`UPDATE free_jobs SET attempts=attempts+1,lease_token=?, lease_until=? WHERE id=(
      SELECT id FROM free_jobs WHERE next_at<=? AND lease_until<=? AND attempts<5 ORDER BY next_at LIMIT 1) RETURNING id,revision`)
      .bind(token, Date.now()+900_000, Date.now(), Date.now()).first<{ id: string; revision: string }>()
    if (!row) return json({ job: null })
    try { await spend(env.CMS_DB, "prepare-day", 50, 86_400_000) }
    catch(error) {
      await env.CMS_DB.prepare("UPDATE free_jobs SET attempts=attempts-1,lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?").bind(row.id,token).run()
      throw error
    }
    const entry = await env.CMS_DB.prepare("SELECT kind,item,cover FROM free_content WHERE id=?").bind(row.id).first<{ kind: "research" | "notice"; item: string; cover:string|null }>()
    if (!entry) { await env.CMS_DB.prepare("DELETE FROM free_jobs WHERE id=? AND lease_token=?").bind(row.id, token).run(); return json({ job: null }) }
    return json({ job: { ...row, token, kind: entry.kind, item: JSON.parse(entry.item),cover:entry.cover?JSON.parse(entry.cover):null } })
  }
  const match = /^\/api\/internal\/jobs\/([a-f\d]{32})\/(complete|fail)$/.exec(path)
  if (!match || request.method !== "POST") return json({ error: "Not found" }, 404)
  const id = normalizeId(match[1])!
  const input = JSON.parse(await limitedBody(request))
  const lease = await env.CMS_DB.prepare("SELECT revision FROM free_jobs WHERE id=? AND lease_token=? AND lease_until>?").bind(id,input.token,Date.now()).first<{ revision: string }>()
  if (!lease || lease.revision !== input.revision) return json({ error: "Job changed or expired" }, 409)
  if (match[2] === "fail") {
    await env.CMS_DB.prepare("UPDATE free_jobs SET next_at=?,lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?")
      .bind(Date.now()+Math.max(900_000,Math.min(86_400_000,Number(input.retryAfterMs)||900_000)),id,input.token).run()
    return json({ ok: true })
  }
  const entry = await env.CMS_DB.prepare("SELECT kind FROM free_content WHERE id=?").bind(id).first<{ kind: "research" | "notice" }>()
  const item = entry && await published(env, entry.kind, id)
  if (!item || item.editedAt !== lease.revision) return json({ error: "Publication changed" },409)
  if (!Array.isArray(input.blocks) || input.blocks.length > 500) return json({ error: "Invalid body" },400)
  if (input.cover && (!new RegExp(`^/report-covers/${id}/[a-f0-9]{64}\\.webp$`).test(input.cover.url)
    || !new RegExp(`^/report-covers/${id}/[a-f0-9]{64}\\.webp$`).test(input.cover.previewUrl)
    || ![input.cover.width,input.cover.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=4096))) return json({error:"Invalid cover"},400)
  const media:string[]=[]
  function collect(blocks: {id:string;type:string;children?:unknown[]}[]) {
    for(const block of blocks) {
      const blockId=typeof block.id==="string" && normalizeId(block.id)
      if(blockId && ["file","pdf","video","audio"].includes(block.type)) media.push(blockId)
      if(Array.isArray(block.children)) collect(block.children as typeof blocks)
    }
  }
  collect(input.blocks)
  await env.CMS_DB.batch([
    env.CMS_DB.prepare("DELETE FROM free_media WHERE page_id=?").bind(id),
    env.CMS_DB.prepare("INSERT INTO free_media(page_id,block_id) SELECT ?,value FROM json_each(?)").bind(id,JSON.stringify(media)),
    env.CMS_DB.prepare("UPDATE free_content SET blocks=?,body_revision=?,cover=? WHERE id=? AND revision=?")
      .bind(JSON.stringify(input.blocks),lease.revision,input.cover?JSON.stringify(input.cover):null,id,lease.revision),
    env.CMS_DB.prepare("DELETE FROM free_jobs WHERE id=? AND lease_token=? AND revision=?").bind(id,input.token,lease.revision),
  ])
  await rebuildDocuments(env)
  return json({ ok: true })
}
