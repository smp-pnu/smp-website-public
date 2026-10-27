// Trusted Node runner only. Visitor requests never render PDFs or call Notion.
import { mkdir, readFile, writeFile, readdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Env } from "../free/server/types";
import type { ContentItem } from "../lib/content-model";
import type { Payload } from "./model";
import { CmsStore } from "./store";
import { prepareCover } from "../free/jobs/prepare";
import { prepareRecruitment } from "../free/jobs/recruitment";
import { prepareReaderAssets } from "../free/jobs/reader-assets";
import { publicationAssets } from "../free/jobs/publication-assets";
import { setAdminConfig } from "../free/jobs/admin-schema";
import {
  LocalPublicationAssets,
  prepareApprovedPdf,
} from "../admin-publisher/assets";
import { chunkBytes, fileIdentity } from "../admin-cloud/protocol";
import { spend } from "../free/server/budget";

type Job = { id: string; revision: number; payload: string; attempts: number };
async function download(env: Env, job: Job, p: Payload) {
  const upload = p.upload!,
    source = await env.CMS_DB.prepare(
      "SELECT token FROM cms_job_sources WHERE id=? AND revision=? AND expires_at>?",
    )
      .bind(job.id, job.revision, Date.now())
      .first<{ token: string }>();
  if (!source) throw Error("approval_expired");
  const data = new Uint8Array(upload.report.bytes);
  for (let offset = 0; offset < data.length; offset += chunkBytes) {
    const r = await fetch(
      `https://admin.pnusmp.com/api/cms-export/${job.id}/${offset / chunkBytes}`,
      {
        headers: { Authorization: `Bearer ${source.token}` },
        redirect: "error",
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!r.ok) {
      await r.body?.cancel();
      throw Error("source_unavailable");
    }
    const part = new Uint8Array(await r.arrayBuffer());
    if (part.length !== Math.min(chunkBytes, data.length - offset))
      throw Error("source_incomplete");
    data.set(part, offset);
  }
  if ((await fileIdentity(data)) !== upload.report.identity)
    throw Error("source_integrity");
  return data;
}
async function recoverImages(records: unknown[], origin: URL) {
  const urls = publicationAssets(records, origin.origin);
  if (urls.size > 5000) throw Error("image_budget");
  for (const url of urls) {
    const file = path.join(
        ".smp-cache/covers",
        url.slice("/report-covers/".length),
      ),
      hash = path.basename(url).slice(0, -5);
    try {
      if (
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex") === hash
      )
        continue;
    } catch {}
    const r = await fetch(new URL(url, origin), {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (
      !r.ok ||
      !r.headers.get("content-type")?.startsWith("image/webp") ||
      Number(r.headers.get("content-length")) > 10 * 1024 * 1024
    ) {
      await r.body?.cancel();
      throw Error("published_image_unavailable");
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (
      bytes.length > 10 * 1024 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== hash
    )
      throw Error("published_image_integrity");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  return urls;
}
export async function publishCms(
  env: Env,
  origin: URL,
  deadline: number,
  deploy = true,
) {
  const recruitment = await prepareRecruitment(env),
    force = process.env.SMP_FORCE_BUILD === "1" || recruitment.changed,
    complete: { job: Job; p: Payload }[] = [],
    store = new CmsStore(env.CMS_DB);
  for (let n = 0; n < 2 && Date.now() < deadline - 120000; n++) {
    const job = await env.CMS_DB.prepare(
      `UPDATE cms_jobs SET lease_until=?,attempts=attempts+1 WHERE id=(SELECT j.id FROM cms_jobs j JOIN cms_entries e ON e.id=j.id WHERE j.revision=e.revision AND e.trashed_at IS NULL AND j.attempts<3 AND j.next_at<=? AND j.lease_until<=? ORDER BY j.next_at LIMIT 1) RETURNING id,revision,payload,attempts`,
    )
      .bind(deadline, Date.now(), Date.now())
      .first<Job>();
    if (!job) break;
    try {
      await spend(env.CMS_DB, "cms-pdf-day", 10, 86400000);
      const p: Payload = JSON.parse(job.payload);
      if (p.upload) {
        const root = path.resolve(
            ".smp-tools/cms-preparation",
            `${job.id}-${job.revision}`,
          ),
          assets = new LocalPublicationAssets(root);
        await assets.init();
        const edition = await prepareApprovedPdf(
          { ...p.upload.report, id: job.id },
          await download(env, job, p),
          assets,
        );
        await assets.verify({ ...p.upload.report, id: job.id }, edition);
        for (const [folder, target] of [
          ["report-covers", "covers"],
          ["_reader-pdfs", "reader-pdfs"],
        ] as const) {
          await mkdir(`.smp-cache/${target}`, { recursive: true });
          await cp(path.join(root, folder), `.smp-cache/${target}`, {
            recursive: true,
          });
        }
        p.cover = edition.cover;
        p.original = edition.original;
      } else
        p.cover = await prepareCover(
          p.item as ContentItem,
          p.cover as Parameters<typeof prepareCover>[1],
        );
      if (!p.cover) throw Error("pdf_preparation_failed");
      complete.push({ job, p });
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          "approval_expired",
          "source_unavailable",
          "source_incomplete",
          "source_integrity",
          "pdf_preparation_failed",
        ].includes(error.message)
          ? error.message
          : "preparation_failed";
      await env.CMS_DB.prepare(
        "UPDATE cms_jobs SET lease_until=0,next_at=?,error=? WHERE id=? AND revision=?",
      )
        .bind(Date.now() + 900000, code, job.id, job.revision)
        .run();
      console.warn(JSON.stringify({ cmsJob: job.id, error: code }));
    }
  }
  if (!complete.length && !force) {
    console.log("CMS: no asset deployment needed");
    return;
  }
  const rows = (
    await env.CMS_DB.prepare(
      "SELECT id,item,cover,blocks FROM free_content",
    ).all<{
      id: string;
      item: string;
      cover: string | null;
      blocks: string | null;
    }>()
  ).results;
  const records = rows.flatMap((r) => [
    r.cover ? JSON.parse(r.cover) : null,
    r.blocks ? JSON.parse(r.blocks) : null,
  ]);
  await recoverImages(
    [...records, ...complete.flatMap((x) => [x.p.cover, x.p.blocks])],
    origin,
  );
  const reader = new Map(
    rows
      .filter((r) => r.cover && JSON.parse(r.item).kind === "research")
      .map((r) => [
        r.id,
        {
          id: r.id,
          date: JSON.parse(r.item).date,
          cover: JSON.parse(r.cover!),
          requiredOriginal: !!JSON.parse(r.item).managedPdf,
        },
      ]),
  );
  for (const { job, p } of complete)
    reader.set(job.id, {
      id: job.id,
      date: (p.item as ContentItem).date,
      cover: p.cover,
      requiredOriginal: !!(p.item as ContentItem).managedPdf,
    });
  await prepareReaderAssets([...reader.values()], origin, deadline - 60000);
  if (!deploy) return;
  for (const script of ["scripts/build-free.mjs", "scripts/deploy-free.mjs"]) {
    const r = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      env: { ...process.env, SMP_CMS_ADMIN_BUILD: "1" },
    });
    if (r.status !== 0)
      throw Error("CMS deployment failed; previous approvals preserved");
  }
  for (const { job, p } of complete) {
    await store.complete(job.id, job.revision, p);
    await env.CMS_DB.batch([
      env.CMS_DB.prepare(
        "DELETE FROM cms_job_sources WHERE id=? AND revision=?",
      ).bind(job.id, job.revision),
      env.CMS_DB.prepare(
        "DELETE FROM cms_export_grants WHERE id=? AND revision=?",
      ).bind(job.id, job.revision),
    ]);
    await rm(
      path.resolve(".smp-tools/cms-preparation", `${job.id}-${job.revision}`),
      { recursive: true, force: true },
    );
  }
  await setAdminConfig(
    env.CMS_DB,
    "recruitment_deployed",
    recruitment.fingerprint,
  );
  if (process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT, "assets_changed=true\n", {
      flag: "a",
    });
  console.log(
    JSON.stringify({ cmsPublished: complete.length, source: "admin" }),
  );
}
