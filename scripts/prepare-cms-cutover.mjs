// Offline, read-only preparation. No environment credentials or network.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  toContentItem,
  sortContent,
  normalizeId,
} from "../lib/content-model.ts";
import { sortMembers } from "../lib/member-model.ts";
import { validatePayload } from "../cms/model.ts";
const [source, output] = process.argv.slice(2);
if (
  !source ||
  !output ||
  !path.isAbsolute(source) ||
  !path.isAbsolute(output) ||
  source === output
)
  throw Error("Use separate absolute private snapshot/output directories");
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const read = async (name) =>
  JSON.parse(await fs.readFile(path.join(source, name), "utf8"));
const published = await read("production-free_content.json"),
  notices = await read("notice-pages.json"),
  files = await read("notice-file-manifest.json");
if (
  !Array.isArray(published) ||
  published.length < 800 ||
  !Array.isArray(notices)
)
  throw Error("Incomplete snapshot");
const assets = [],
  attachments = new Map();
for (const file of files) {
  if (file.type === "image") continue; // The public image already has an immutable static copy.
  const bytes = await fs.readFile(file.path);
  if (
    bytes.length !== file.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256 ||
    bytes.length > 1400000
  )
    throw Error("Attachment integrity or size mismatch");
  const mime =
    bytes.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
        ? "application/zip"
        : null;
  if (!mime) throw Error("Unsupported attachment");
  assets.push({
    id: file.id,
    owner: file.page,
    name:
      file.name === "attachment"
        ? mime === "application/pdf"
          ? "SMP-회칙.pdf"
          : "SMP-회칙.zip"
        : file.name,
    mime,
    bytes: bytes.length,
    data: bytes.toString("base64"),
    created_at: new Date().toISOString(),
  });
  attachments.set(file.id, `https://pnusmp.com/api/cms-media/${file.id}`);
}
function blocks(input) {
  return input.map((block) => {
    const b = {
      id: block.id,
      type: block.type,
      [block.type]: structuredClone(block[block.type] ?? {}),
    };
    if (block.children) b.children = blocks(block.children);
    const link = attachments.get(normalizeId(block.id));
    if (link)
      b[block.type] = {
        type: "external",
        external: { url: link },
        name:
          block[block.type]?.name ??
          (block.type === "pdf" ? "SMP-회칙.pdf" : "첨부파일"),
        caption: block[block.type]?.caption ?? [],
      };
    return b;
  });
}
const canonical = (value) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll("https://smp-pnu.vercel.app", "https://pnusmp.com")
      .replaceAll(
        "https://smp-website-free.smp-website.workers.dev",
        "https://pnusmp.com",
      ),
  );
const records = published.map((row) => {
  const item = JSON.parse(row.item),
    body = blocks(JSON.parse(row.blocks ?? "[]")),
    cover = row.cover ? JSON.parse(row.cover) : null;
  return {
    id: row.id,
    kind: row.kind,
    revision: 1,
    approvedRevision: 1,
    source: "notion",
    rank: 0,
    updatedAt: row.revision,
    draft: { item, blocks: body, cover },
  };
});
for (const page of notices) {
  const id = normalizeId(page.id);
  if (records.some((r) => r.id === id)) continue;
  const copy = structuredClone(page);
  copy.properties["공개"] = { type: "checkbox", checkbox: true };
  if (!copy.properties["게시일"]?.date?.start)
    copy.properties["게시일"] = {
      type: "date",
      date: { start: page.created_time.slice(0, 10) },
    };
  const item = toContentItem(copy, "notice", Date.parse("2100-01-01"));
  if (!item) throw Error("Unconvertible private notice");
  const body = blocks(await read(`notice-body-${id}.json`));
  records.push({
    id,
    kind: "notice",
    revision: 1,
    approvedRevision: null,
    source: "notion",
    rank: 0,
    updatedAt: page.last_edited_time,
    draft: { item, blocks: body, cover: null },
  });
}
for (const kind of ["research", "notice", "members"]) {
  const filtered = records.filter((r) => r.kind === kind),
    sorted =
      kind === "members"
        ? sortMembers(filtered.map((r) => r.draft.item))
        : sortContent(filtered.map((r) => r.draft.item)),
    rank = new Map(sorted.map((i, n) => [i.id, (n + 1) * 1024]));
  for (const r of filtered) {
    r.rank = rank.get(r.id);
    if (kind !== "members") r.draft.item.displayOrder = r.rank;
    r.draft = canonical(r.draft);
    validatePayload(r.draft, kind, r.id);
  }
}
const ready = records.filter((r) => r.approvedRevision),
  counts = Object.fromEntries(
    ["research", "notice", "members"].map((k) => [
      k,
      records.filter((r) => r.kind === k).length,
    ]),
  );
if (
  ready.length !== published.length ||
  new Set(records.map((r) => r.id)).size !== records.length ||
  records
    .filter((r) => r.kind === "research")
    .some((r) => !r.draft.cover?.reader?.pagePack)
)
  throw Error("Publication parity or reader readiness failed");
const plan = {
  version: 1,
  createdAt: new Date().toISOString(),
  counts,
  published: ready.length,
  private: records.length - ready.length,
  records,
  assets,
};
await fs.writeFile(
  path.join(output, "cutover-plan.json"),
  JSON.stringify(plan),
  { mode: 0o600 },
);
await fs.writeFile(
  path.join(output, "summary.json"),
  JSON.stringify(
    {
      counts,
      published: plan.published,
      private: plan.private,
      assets: assets.map(({ id, owner, bytes, mime }) => ({
        id,
        owner,
        bytes,
        mime,
      })),
      fingerprint: createHash("sha256")
        .update(JSON.stringify(plan))
        .digest("hex"),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    counts,
    published: plan.published,
    private: plan.private,
    attachmentBytes: assets.reduce((sum, a) => sum + a.bytes, 0),
  }),
);
