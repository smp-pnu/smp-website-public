import { normalizeId } from "../lib/content-model"
import { database } from "./bindings"

export async function prepareContent(rawId: string, eventType: string) {
  const id = normalizeId(rawId)
  if (!id || !/^page\.[a-z_]+$/.test(eventType)) throw new Error("Invalid content event")
  await database().prepare(`INSERT INTO content_jobs (id, event_type, revision, available_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET event_type = excluded.event_type,
    revision = content_jobs.revision + 1, available_at = excluded.available_at`)
    .bind(id, eventType, Date.now()).run()
  return { queued: true, prepared: false }
}

export async function reconcileContent() {
  await database().prepare(`INSERT INTO content_jobs (id, event_type, revision, available_at)
    VALUES ('reconcile', 'reconcile', 1, ?)
    ON CONFLICT(id) DO NOTHING`).bind(Date.now()).run()
  return { queued: true, failed: 0 }
}
