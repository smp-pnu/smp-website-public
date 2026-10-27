import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import type { Env } from "../admin-cloud/worker";
import type { DriveUploads } from "../admin-cloud/drive/uploads";
import { ApprovedReportSource } from "../admin-cloud/publication-source";
import { publicReport } from "../admin-publication/model";
import { HttpError, object } from "../admin-server/validation";
import { validateCover } from "../admin-cloud/files";
import {
  defaultRecruitment,
  parseRecruitment,
  type Recruitment,
} from "../lib/recruitment";
import type { NotionPage } from "../lib/content-model";
import { CmsStore } from "./store";
import { cmsLimits, type Kind, type Payload } from "./model";
const idPattern = /^[a-f0-9]{32}$/;
const json = (value: unknown, status = 200) => Response.json(value, { status });
export async function cmsExport(
  request: Request,
  env: Env,
  drive: DriveUploads,
  now: number,
) {
  if (!env.CMS_DB || request.method !== "GET")
    throw new HttpError(404, "Not found");
  const m = /^\/api\/cms-export\/([a-f0-9]{32})\/(\d{1,3})$/.exec(
      new URL(request.url).pathname,
    ),
    token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!m || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(404, "Not found");
  const hash = createHash("sha256").update(token).digest("hex");
  const grant = await env.CMS_DB.prepare(
    `UPDATE cms_export_grants SET hits=hits+1 WHERE token_hash=? AND id=? AND expires_at>? AND hits<400
    AND EXISTS(SELECT 1 FROM cms_jobs j JOIN cms_entries e ON e.id=j.id WHERE j.id=cms_export_grants.id AND j.revision=cms_export_grants.revision AND e.revision=j.revision AND e.trashed_at IS NULL)
    RETURNING source_id,source_revision`,
  )
    .bind(hash, m[1], now)
    .first<{ source_id: string; source_revision: number }>();
  if (!grant) throw new HttpError(404, "Not found");
  return new Response(
    await new ApprovedReportSource(env.ADMIN_DB, drive, now).part(
      grant.source_id,
      grant.source_revision,
      Number(m[2]),
    ),
    { headers: { "Content-Type": "application/octet-stream" } },
  );
}
function recruitment(value: unknown): Recruitment {
  const v = object(value),
    properties: NotionPage["properties"] = {};
  properties["기수"] = { type: "number", number: Number(v.generation) };
  properties["모집 상태"] = {
    type: "select",
    select: {
      name: (
        {
          upcoming: "모집 예정",
          open: "모집 중",
          closed: "모집 마감",
        } as Record<string, string>
      )[String(v.status)],
    },
  };
  properties["일정 확정"] = {
    type: "checkbox",
    checkbox: v.scheduleConfirmed === true,
  };
  for (const [key, label] of Object.entries({
    period: "일정 표시",
    audience: "모집 대상",
    requirement: "활동 요건",
    capacity: "모집 인원",
    schedule: "활동 일정",
    location: "활동 장소",
    duration: "활동 기간",
    fees: "회비 안내",
    process: "전형 안내",
  }))
    properties[label] = {
      type: "rich_text",
      rich_text: [{ plain_text: String(v[key] ?? "") }],
    };
  properties["접수 시작"] = {
    type: "date",
    date: v.start ? { start: String(v.start) } : null,
  };
  properties["접수 종료"] = {
    type: "date",
    date: v.end ? { start: String(v.end) } : null,
  };
  properties["지원 링크"] = {
    type: "url",
    url: v.applicationUrl ? String(v.applicationUrl) : null,
  };
  try {
    return parseRecruitment({
      id: "",
      object: "page",
      created_time: "",
      properties,
    });
  } catch {
    throw new HttpError(
      400,
      "모집 기수·일정·필수 문구와 지원 링크를 확인해 주세요.",
    );
  }
}
export async function cmsApi(
  request: Request,
  env: Env,
  drive: DriveUploads,
  readJson: () => Promise<unknown>,
  readBytes: (max: number) => Promise<Uint8Array>,
  now: number,
) {
  if (!env.CMS_DB)
    throw new HttpError(404, "관리 자료 연결을 준비하고 있어요.");
  const db = env.CMS_DB,
    store = new CmsStore(db, now),
    url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/api/cms/status" && method === "GET")
    return json(await store.status());
  if (path === "/api/cms/recruitment") {
    if (method === "GET") {
      const row = await db
        .prepare(
          "SELECT value FROM free_admin_config WHERE name='recruitment_validated'",
        )
        .first<{ value: string }>();
      return json(row ? JSON.parse(row.value) : defaultRecruitment);
    }
    if (method === "PUT") {
      const value = recruitment(await readJson());
      await db
        .prepare(
          "INSERT INTO free_admin_config(name,value) VALUES('recruitment_validated',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        )
        .bind(JSON.stringify(value))
        .run();
      return json(value);
    }
  }
  if (path === "/api/cms/import-upload" && method === "POST") {
    const { id, target } = object(await readJson()),
      source = new ApprovedReportSource(env.ADMIN_DB, drive, now);
    const report = (await source.snapshot()).reports.find(
      (r) => r.id === String(id).replaceAll("-", ""),
    );
    if (!report)
      throw new HttpError(409, "PDF 입력 검토와 승인을 먼저 완료해 주세요.");
    if (
      target !== undefined &&
      (typeof target !== "string" || !idPattern.test(target))
    )
      throw new HttpError(400, "교체할 리포트를 확인해 주세요.");
    const targetId = typeof target === "string" ? target : report.id;
    const existing = await db
      .prepare("SELECT id FROM cms_entries WHERE id=?")
      .bind(targetId)
      .first();
    if (existing) {
      const entry = await store.get(targetId);
      if (entry.kind !== "research" || entry.trashedAt)
        throw new HttpError(409, "교체할 리포트를 확인해 주세요.");
      if (
        entry.draft.upload?.revision === report.revision &&
        entry.draft.upload?.id === report.id
      )
        return json(entry);
      const same =
        (entry.draft.item as import("../lib/content-model").ContentItem)
          .managedPdf?.identity === report.identity;
      const next: Payload = {
        ...entry.draft,
        item: {
          ...entry.draft.item,
          managedPdf: { name: report.filename, identity: report.identity },
          externalUrl: null,
          attachments: [],
          editedAt: new Date(now).toISOString(),
        } as import("../lib/content-model").ContentItem,
        cover: same ? entry.draft.cover : null,
        upload: { id: report.id, revision: report.revision, report },
        ...(same && entry.draft.original
          ? { original: entry.draft.original }
          : {}),
      };
      if (!same) delete next.original;
      const replaced = await db
        .prepare(
          "UPDATE cms_entries SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING id",
        )
        .bind(
          JSON.stringify(next),
          new Date(now).toISOString(),
          targetId,
          entry.revision,
        )
        .first();
      if (!replaced)
        throw new HttpError(409, "다른 변경이 저장됐어요. 다시 확인해 주세요.");
      await db
        .prepare("DELETE FROM cms_jobs WHERE id=? AND revision<=?")
        .bind(targetId, entry.revision)
        .run();
      return json(await store.get(targetId));
    }
    const rank = (await db
      .prepare(
        "SELECT COALESCE(MIN(rank)-1024,0) AS n FROM cms_entries WHERE kind='research'",
      )
      .first<{ n: number }>())!.n;
    const payload: Payload = {
      item: { ...publicReport(report, 1), displayOrder: rank },
      blocks: [],
      cover: null,
      upload: { id: report.id, revision: report.revision, report },
    };
    await db
      .prepare(
        `INSERT INTO cms_entries(id,kind,draft,updated_at,rank) VALUES(?,'research',?,?,COALESCE((SELECT MIN(rank)-1024 FROM cms_entries WHERE kind='research'),0))`,
      )
      .bind(report.id, JSON.stringify(payload), new Date(now).toISOString())
      .run();
    return json(await store.get(report.id), 201);
  }
  const listing = /^\/api\/cms\/(research|notice|members)$/.exec(path);
  if (listing) {
    if (method === "GET")
      return json(await store.list(listing[1] as Kind, url.searchParams));
    if (method === "POST")
      return json(
        await store.create(listing[1] as Kind, await readJson()),
        201,
      );
  }
  const assetMatch = /^\/api\/cms\/media\/([a-f0-9]{32})$/.exec(path);
  if (assetMatch && method === "GET") {
    const row = await db
      .prepare("SELECT data,mime FROM cms_assets WHERE id=?")
      .bind(assetMatch[1])
      .first<{ data: string; mime: string }>();
    if (!row) throw new HttpError(404, "파일이 없어요.");
    return new Response(Buffer.from(row.data, "base64"), {
      headers: {
        "Content-Type": row.mime,
        "Content-Security-Policy": "sandbox",
      },
    });
  }
  const m =
    /^\/api\/cms\/entry\/([a-f0-9]{32})(?:\/(approve|withdraw|trash|restore|image|file|move))?$/.exec(
      path,
    );
  if (!m) throw new HttpError(404, "요청한 기능이 없어요.");
  const id = m[1],
    action = m[2];
  if (!action && method === "GET") return json(await store.get(id));
  if (!action && method === "PUT") {
    const input = object(await readJson());
    return json(await store.save(id, Number(input.revision), input.payload));
  }
  if ((action === "image" || action === "file") && method === "POST") {
    const e = await store.get(id);
    if (e.trashedAt)
      throw new HttpError(409, "휴지통 자료에는 사진을 추가할 수 없어요.");
    const bytes = await readBytes(
      action === "image" ? cmsLimits.assetBytes : 1400000,
    );
    const prefix = Buffer.from(bytes.subarray(0, 8)),
      mime =
        action === "image"
          ? validateCover(bytes, bytes.length)
          : prefix.toString("ascii").startsWith("%PDF-")
            ? "application/pdf"
            : prefix.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
              ? "application/zip"
              : null;
    if (!mime)
      throw new HttpError(
        400,
        "첨부파일은 1.4 MB 이하 PDF 또는 ZIP만 지원해요.",
      );
    let name = "attachment";
    try {
      name = decodeURIComponent(
        request.headers.get("x-file-name") ?? "attachment",
      ).slice(0, 200);
    } catch {}
    const used = await db
      .prepare("SELECT COALESCE(sum(bytes),0) AS n FROM cms_assets")
      .first<{ n: number }>();
    if ((used?.n ?? 0) + bytes.length > cmsLimits.assetsBytes)
      throw new HttpError(413, "사진 저장 한도에 도달했어요.");
    const asset = crypto.randomUUID().replaceAll("-", "");
    await db
      .prepare(
        "INSERT INTO cms_assets(id,owner,name,mime,bytes,data,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        asset,
        id,
        name,
        mime,
        bytes.length,
        Buffer.from(bytes).toString("base64"),
        new Date(now).toISOString(),
      )
      .run();
    return json({ url: `https://pnusmp.com/api/cms-media/${asset}` }, 201);
  }
  if (action && method === "POST") {
    const input = object(await readJson()),
      revision = Number(input.revision);
    if (action === "approve") {
      const result = await store.approve(id, revision);
      if (result.pending && result.draft.upload) {
        const token = randomBytes(32).toString("hex"),
          hash = createHash("sha256").update(token).digest("hex"),
          upload = result.draft.upload,
          expires = now + 86400000;
        await db.batch([
          db.prepare("DELETE FROM cms_export_grants WHERE id=?").bind(id),
          db
            .prepare(
              "INSERT INTO cms_export_grants(token_hash,id,revision,source_id,source_revision,expires_at) VALUES(?,?,?,?,?,?)",
            )
            .bind(hash, id, revision, upload.id, upload.revision, expires),
          db
            .prepare(
              "INSERT INTO cms_job_sources(id,revision,token,expires_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,token=excluded.token,expires_at=excluded.expires_at",
            )
            .bind(id, revision, token, expires),
        ]);
      }
      return json(result);
    }
    if (["withdraw", "trash", "restore"].includes(action))
      return json(
        await store.change(
          id,
          revision,
          action as "withdraw" | "trash" | "restore",
        ),
      );
    if (action === "move") {
      if (
        typeof input.target !== "string" ||
        !idPattern.test(input.target) ||
        !["before", "after"].includes(String(input.placement))
      )
        throw new HttpError(400, "이동 위치를 확인해 주세요.");
      const e = await store.get(id),
        target = await store.get(input.target);
      store.current(e, revision);
      if (target.trashedAt || target.kind !== e.kind || e.id === target.id)
        throw new HttpError(400, "같은 목록 안에서 이동해 주세요.");
      const before = input.placement === "before",
        neighbor = await db
          .prepare(
            `SELECT rank FROM cms_entries WHERE kind=? AND trashed_at IS NULL AND id<>? AND rank${before ? "<" : ">"}? ORDER BY rank ${before ? "DESC" : "ASC"} LIMIT 1`,
          )
          .bind(e.kind, e.id, target.rank)
          .first<{ rank: number }>();
      const rank =
        (target.rank +
          (neighbor?.rank ?? target.rank + (before ? -2048 : 2048))) /
        2;
      if (!Number.isFinite(rank) || Math.abs(rank - target.rank) < 1e-8)
        throw new HttpError(409, "순서 간격을 정리한 뒤 다시 시도해 주세요.");
      const payload = {
        ...e.draft,
        item: { ...e.draft.item, displayOrder: rank },
      };
      await store.save(id, revision, payload);
      await db
        .prepare("UPDATE cms_entries SET rank=? WHERE id=? AND revision=?")
        .bind(rank, id, revision + 1)
        .run();
      if (e.approvedRevision === revision)
        await store.approve(id, revision + 1);
      return json(await store.get(id));
    }
  }
  throw new HttpError(405, "지원하지 않는 요청이에요.");
}
