import type { Env } from "../admin-cloud/worker";
import { HttpError } from "../admin-server/validation";
import { ReportVersions } from "../admin-cloud/report-versions";
import type { ObjectRow } from "../admin-cloud/store";
// A PDF in the publication library cannot be removed through the upload inbox.
// Replacement versions remain retained by ReportVersions until every CMS entry
// using that upload has spent at least 30 days in Trash.
export async function guardUploadDeletion(env: Env, ids: string[]) {
  if (!env.CMS_DB || !ids.length) return;
  const linked = await env.CMS_DB.prepare(
    `SELECT id FROM cms_entries WHERE json_extract(draft,'$.upload.id') IN(SELECT value FROM json_each(?)) LIMIT 1`,
  )
    .bind(JSON.stringify(ids.map((id) => id.replaceAll("-", ""))))
    .first();
  if (linked)
    throw new HttpError(
      409,
      "게시 관리에서 사용하는 PDF입니다. 먼저 게시 목록에서 휴지통으로 옮겨 주세요. 30일 뒤 원본도 정리합니다.",
    );
}
export async function cmsMaintenance(env: Env, now: number) {
  if (!env.CMS_DB) return;
  const db = env.CMS_DB,
    lease = await db
      .prepare(
        `INSERT INTO free_controls(name,until_at) VALUES('cms-housekeeping',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE until_at<=? RETURNING name`,
      )
      .bind(now + 3600000, now)
      .first();
  if (!lease) return;
  const cutoff = new Date(now - 30 * 86400000).toISOString(),
    rows = await db
      .prepare(
        `SELECT id,json_extract(draft,'$.upload.id') AS upload FROM cms_entries WHERE trashed_at<? AND approved IS NULL LIMIT 2`,
      )
      .bind(cutoff)
      .all<{ id: string; upload: string | null }>();
  for (const row of rows.results) {
    if (
      row.upload &&
      !(await db
        .prepare(
          "SELECT id FROM cms_entries WHERE id<>? AND json_extract(draft,'$.upload.id')=? LIMIT 1",
        )
        .bind(row.id, row.upload)
        .first())
    ) {
      const object = await env.ADMIN_DB.prepare(
        "SELECT * FROM objects WHERE replace(id,'-','')=?",
      )
        .bind(row.upload)
        .first<ObjectRow>();
      if (object)
        await env.ADMIN_DB.batch(
          await new ReportVersions(env.ADMIN_DB, now).purgeStatements(
            object,
            0,
          ),
        );
    }
    await db.batch([
      db.prepare("DELETE FROM cms_jobs WHERE id=?").bind(row.id),
      db.prepare("DELETE FROM cms_job_sources WHERE id=?").bind(row.id),
      db.prepare("DELETE FROM cms_export_grants WHERE id=?").bind(row.id),
      db
        .prepare(
          "DELETE FROM cms_assets WHERE owner=? AND NOT EXISTS(SELECT 1 FROM free_content WHERE id=?)",
        )
        .bind(row.id, row.id),
      db.prepare("DELETE FROM cms_history WHERE id=?").bind(row.id),
      db
        .prepare(
          "DELETE FROM cms_entries WHERE id=? AND trashed_at<? AND approved IS NULL",
        )
        .bind(row.id, cutoff),
    ]);
  }
  await db.batch([
    db.prepare("DELETE FROM cms_export_grants WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM cms_job_sources WHERE expires_at<?").bind(now),
    db
      .prepare(
        `DELETE FROM cms_assets WHERE id IN(SELECT a.id FROM cms_assets a JOIN cms_entries e ON e.id=a.owner WHERE a.created_at<? AND instr(e.draft,a.id)=0 AND (e.approved IS NULL OR instr(e.approved,a.id)=0) AND NOT EXISTS(SELECT 1 FROM cms_history h WHERE h.id=e.id AND instr(h.payload,a.id)>0) LIMIT 10)`,
      )
      .bind(cutoff),
  ]);
}
