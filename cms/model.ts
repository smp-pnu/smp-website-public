import type { ContentItem } from "../lib/content-model";
import { normalizeId, safeUrl } from "../lib/content-model";
import type { Member } from "../lib/member-model";
import type { ContentBlock } from "../lib/notion-model";
import type { ApprovedReport } from "../admin-publication/model";
export type Kind = "research" | "notice" | "members";
export type Payload = {
  item: ContentItem | Member;
  blocks: ContentBlock[];
  cover: unknown | null;
  original?: unknown;
  upload?: { id: string; revision: number; report: ApprovedReport };
};
export type Entry = {
  id: string;
  kind: Kind;
  draft: Payload;
  revision: number;
  approvedRevision: number | null;
  updatedAt: string;
  trashedAt: string | null;
  source: string;
  rank: number;
  pending: boolean;
  error: string | null;
};
export const cmsLimits = {
  entries: 2500,
  blocks: 400,
  text: 4000,
  bodyBytes: 256 * 1024,
  assetsBytes: 100 * 1024 * 1024,
  assetBytes: 1024 * 1024,
  history: 5,
} as const;
export const allowedBlocks = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "quote",
  "callout",
  "divider",
  "image",
  "pdf",
  "file",
  "table",
  "table_row",
  "to_do",
  "toggle",
  "code",
  "bookmark",
];
function text(v: unknown, max: number = cmsLimits.text): v is string {
  return typeof v === "string" && v.length <= max && !/[\u0000-\u0008]/.test(v);
}
function url(v: unknown) {
  return (
    typeof v === "string" &&
    (!!safeUrl(v) ||
      /^\/(?:report-covers\/[a-f0-9]{32}\/[a-f0-9]{64}\.webp|api\/cms-media\/[a-f0-9]{32}|api\/member-photo\/[a-f0-9]{32})$/.test(
        v,
      ))
  );
}
export function validateBlocks(
  input: unknown,
): asserts input is ContentBlock[] {
  let count = 0;
  const walk = (value: unknown, depth: number) => {
    if (!Array.isArray(value) || depth > 8)
      throw Error("본문 구조를 확인해 주세요.");
    for (const b of value) {
      if (
        ++count > cmsLimits.blocks ||
        !b ||
        typeof b !== "object" ||
        !normalizeId(b.id) ||
        !allowedBlocks.includes(b.type)
      )
        throw Error("지원하지 않는 본문 형식이에요.");
      const v = b[b.type] ?? {};
      const rich = (parts: unknown) => {
        if (!Array.isArray(parts) || parts.length > 300)
          throw Error("글자 서식을 확인해 주세요.");
        for (const p of parts) {
          if (!text(p?.plain_text ?? p?.text?.content ?? ""))
            throw Error("문장이 너무 길어요.");
          if (
            (p?.href && !safeUrl(p.href)) ||
            (p?.text?.link?.url && !safeUrl(p.text.link.url))
          )
            throw Error("링크는 https 주소로 입력해 주세요.");
        }
      };
      if (v.rich_text) rich(v.rich_text);
      if (v.caption) rich(v.caption);
      if (v.cells) {
        if (!Array.isArray(v.cells) || v.cells.length > 20)
          throw Error("표는 20열까지 지원해요.");
        v.cells.forEach(rich);
      }
      for (const target of [v.url, v.external?.url, v.file?.url])
        if (target && !url(target))
          throw Error("사진·첨부파일 주소를 확인해 주세요.");
      if (b.children) walk(b.children, depth + 1);
    }
  };
  walk(input, 0);
}
export function validatePayload(
  value: unknown,
  kind: Kind,
  id: string,
): Payload {
  const p = value as Payload,
    i = p?.item as ContentItem & Member;
  if (
    !p ||
    typeof p !== "object" ||
    !i ||
    i.id !== id ||
    !normalizeId(id) ||
    JSON.stringify(p).length > cmsLimits.bodyBytes
  )
    throw Error("게시 자료 형식을 확인해 주세요.");
  if (
    "displayOrder" in i &&
    (!Number.isFinite(i.displayOrder) || Math.abs(i.displayOrder!) > 1e12)
  )
    throw Error("표시 순서를 확인해 주세요.");
  if (kind === "members") {
    if ("kind" in p.item) throw Error("회원 자료 형식을 확인해 주세요.");
    if (
      !text(i.name, 100) ||
      !i.name.trim() ||
      !Number.isInteger(i.generation) ||
      i.generation < 1 ||
      i.generation > 999 ||
      !["alumni", "members"].includes(i.group) ||
      !text(i.department, 150) ||
      !text(i.year, 30) ||
      (i.image && !url(i.image)) ||
      (i.roles &&
        (!Array.isArray(i.roles) ||
          i.roles.length > 3 ||
          i.roles.some((r) => !["회장", "부회장", "기장"].includes(r))))
    )
      throw Error("이름·기수·직책을 확인해 주세요.");
  } else {
    if (
      i.kind !== kind ||
      !text(i.title, 500) ||
      !i.title.trim() ||
      !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(i.date) ||
      !Number.isFinite(Date.parse(i.date)) ||
      !text(i.summary) ||
      !text(i.author, 150) ||
      !text(i.category, 100) ||
      typeof i.pinned !== "boolean"
    )
      throw Error("제목·게시일·작성자를 확인해 주세요.");
    for (const field of [
      "semester",
      "industry",
      "company",
      "ticker",
      "reportType",
      "activity",
      "categoryColor",
    ] as const)
      if (i[field] !== undefined && !text(i[field], 150))
        throw Error("입력 내용이 너무 길어요.");
    if (
      (i.semester && !/^\d{4}-[12]$/.test(i.semester)) ||
      (i.ticker && !/^\d{6}$/.test(i.ticker))
    )
      throw Error("학기는 2026-2, 종목코드는 여섯 자리로 입력해 주세요.");
    if (
      i.semesterOrder !== undefined &&
      (!Number.isFinite(i.semesterOrder) || i.semesterOrder <= 0)
    )
      throw Error("표시 순서를 확인해 주세요.");
    if (
      (i.externalUrl && !safeUrl(i.externalUrl)) ||
      !Array.isArray(i.attachments) ||
      i.attachments.length > 20 ||
      i.attachments.some((a) => !text(a.name, 500) || !url(a.url))
    )
      throw Error("첨부파일 주소를 확인해 주세요.");
    if (
      i.investmentPoints &&
      (!Array.isArray(i.investmentPoints) ||
        i.investmentPoints.length > 3 ||
        i.investmentPoints.some((v) => !text(v, 1000)))
    )
      throw Error("투자 포인트를 확인해 주세요.");
  }
  validateBlocks(p.blocks);
  return p;
}
