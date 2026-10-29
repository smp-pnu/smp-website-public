import type { JSONContent } from "@tiptap/core";
import { safeUrl, type RichText } from "../../lib/content-model";
import { blockValue, type ContentBlock } from "../../lib/notion-model";

const styles = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strike",
  code: "code",
} as const;
const listTypes = {
  bulleted_list_item: "bulletList",
  numbered_list_item: "orderedList",
} as const;
export const newBlockId = () => crypto.randomUUID().replaceAll("-", "");

export function inlineDocument(parts: RichText[] = []): JSONContent[] {
  return parts.flatMap((part) => {
    const marks: NonNullable<JSONContent["marks"]> = Object.entries(
      styles,
    ).flatMap(([key, type]) =>
      part.annotations?.[key as keyof typeof styles] ? [{ type }] : [],
    );
    const href = safeUrl(part.href ?? part.text?.link?.url);
    if (href)
      marks.push({
        type: "link",
        attrs: { href, target: "_blank", rel: "noopener noreferrer" },
      });
    return (part.plain_text ?? part.text?.content ?? "")
      .split("\n")
      .flatMap((text, i) => [
        ...(i ? [{ type: "hardBreak" }] : []),
        ...(text
          ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }]
          : []),
      ]);
  });
}

export function inlineRich(nodes: JSONContent[] = []): RichText[] {
  const result: RichText[] = [];
  for (const node of nodes) {
    if (node.type !== "text" && node.type !== "hardBreak")
      throw Error(
        "지원하지 않는 글자 형식입니다. 이전 내용은 저장되지 않았습니다.",
      );
    const text = node.type === "hardBreak" ? "\n" : (node.text ?? "");
    const annotations = Object.fromEntries(
      Object.entries(styles)
        .filter(([, type]) => node.marks?.some((m) => m.type === type))
        .map(([key]) => [key, true]),
    );
    const href = safeUrl(
      node.marks?.find((m) => m.type === "link")?.attrs?.href,
    );
    const part: RichText = {
      text: { content: text, ...(href ? { link: { url: href } } : {}) },
      annotations,
      ...(href ? { href } : {}),
    };
    const previous = result.at(-1);
    if (
      previous &&
      JSON.stringify(previous.annotations) === JSON.stringify(annotations) &&
      (previous.href ?? null) === href
    )
      previous.text!.content += text;
    else result.push(part);
  }
  return result;
}

const sourceAttrs = (source: ContentBlock) => ({ source });
export function noticeDocument(blocks: ContentBlock[]): JSONContent {
  const content: JSONContent[] = [];
  for (const block of blocks) {
    const v = blockValue(block),
      attrs = sourceAttrs(block),
      inline = inlineDocument(v.rich_text);
    // Preserve complex/nested legacy blocks as editable cards instead of flattening their contents.
    if (block.children?.length && block.type !== "table") {
      content.push({ type: "noticeAsset", attrs: { block } });
      continue;
    }
    if (block.type in listTypes) {
      const type = listTypes[block.type as keyof typeof listTypes];
      const item = {
        type: "listItem",
        attrs,
        content: [{ type: "paragraph", content: inline }],
      };
      const last = content.at(-1);
      if (last?.type === type) last.content!.push(item);
      else content.push({ type, content: [item] });
    } else if (block.type === "paragraph")
      content.push({ type: "paragraph", attrs, content: inline });
    else if (/^heading_[123]$/.test(block.type))
      content.push({
        type: "heading",
        attrs: { ...attrs, level: Number(block.type.at(-1)) },
        content: inline,
      });
    else if (block.type === "quote" || block.type === "callout")
      content.push({
        type: block.type === "quote" ? "blockquote" : "noticeCallout",
        attrs,
        content: [{ type: "paragraph", content: inline }],
      });
    else if (block.type === "divider")
      content.push({ type: "horizontalRule", attrs });
    else if (block.type === "code") {
      const text =
        v.rich_text
          ?.map((p) => p.plain_text ?? p.text?.content ?? "")
          .join("") ?? "";
      content.push({
        type: "codeBlock",
        attrs: { ...attrs, language: v.language || null },
        content: text ? [{ type: "text", text }] : [],
      });
    } else if (block.type === "table" && block.children?.length)
      content.push({
        type: "table",
        attrs,
        content: block.children.map((row, ri) => ({
          type: "tableRow",
          attrs: sourceAttrs(row),
          content: (blockValue(row).cells ?? []).map((cell, ci) => ({
            type:
              (v.has_column_header && ri === 0) ||
              (v.has_row_header && ci === 0)
                ? "tableHeader"
                : "tableCell",
            content: [{ type: "paragraph", content: inlineDocument(cell) }],
          })),
        })),
      });
    else content.push({ type: "noticeAsset", attrs: { block } });
  }
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

function normalized(parts: RichText[] = []) {
  return inlineRich(inlineDocument(parts));
}
/** Convert back to the existing CMS schema; no editor JSON reaches the server. */
export function noticeBlocks(document: JSONContent): ContentBlock[] {
  const used = new Set<string>();
  const identity = (source?: ContentBlock) => {
    const id = source?.id && !used.has(source.id) ? source.id : newBlockId();
    used.add(id);
    return id;
  };
  const make = (
    node: JSONContent,
    type: string,
    parts: RichText[] = [],
  ): ContentBlock => {
    const source = node.attrs?.source as ContentBlock | undefined,
      old = source ? blockValue(source) : {};
    const id = identity(source);
    if (
      source?.type === type &&
      (type === "divider" ||
        JSON.stringify(normalized(old.rich_text)) === JSON.stringify(parts))
    )
      return { ...source, id };
    const result = {
      ...(source ?? {}),
      id,
      type,
      [type]: {
        ...(source?.type === type ? old : {}),
        ...(type === "divider" ? {} : { rich_text: parts }),
      },
    };
    if (source && source.type !== type) delete result[source.type];
    return result;
  };
  const textOf = (node: JSONContent): RichText[] => {
    if (node.type === "noticeAsset")
      throw Error("첨부 요소를 본문 문단 사이로 이동해 주세요.");
    if (!node.content?.length) return [];
    if (node.content.every((n) => ["text", "hardBreak"].includes(n.type!)))
      return inlineRich(node.content);
    return node.content.flatMap((n, i) => [
      ...(i ? [{ text: { content: "\n" }, annotations: {} }] : []),
      ...textOf(n),
    ]);
  };
  const walk = (nodes: JSONContent[]): ContentBlock[] =>
    nodes.flatMap((node) => {
      switch (node.type) {
        case "paragraph":
          return [make(node, "paragraph", textOf(node))];
        case "heading":
          return [
            make(
              node,
              `heading_${Math.min(3, Math.max(1, node.attrs?.level ?? 2))}`,
              textOf(node),
            ),
          ];
        case "blockquote":
        case "noticeCallout": {
          const type = node.type === "blockquote" ? "quote" : "callout";
          if (node.content?.every((n) => n.type === "paragraph"))
            return [make(node, type, textOf(node))];
          const first = node.content?.[0],
            hasText = first?.type === "paragraph";
          const result = make(node, type, hasText ? textOf(first) : []);
          result.children = walk((node.content ?? []).slice(hasText ? 1 : 0));
          return [result];
        }
        case "horizontalRule":
          return [make(node, "divider")];
        case "codeBlock": {
          const b = make(node, "code", textOf(node));
          b.code = {
            ...blockValue(b),
            language: node.attrs?.language || "plain text",
          };
          return [b];
        }
        case "bulletList":
        case "orderedList":
          return (node.content ?? []).map((item) => {
            const first = item.content?.[0],
              hasText = first?.type === "paragraph";
            const block = make(
              item,
              node.type === "bulletList"
                ? "bulleted_list_item"
                : "numbered_list_item",
              hasText ? textOf(first) : [],
            );
            const nested = (item.content ?? []).slice(hasText ? 1 : 0);
            if (nested.length) block.children = walk(nested);
            return block;
          });
        case "table": {
          const source = node.attrs?.source as ContentBlock | undefined;
          const rows = (node.content ?? []).map((row) => {
            const old = row.attrs?.source as ContentBlock | undefined;
            const cells = (row.content ?? []).map((cell) => {
              if (
                (cell.attrs?.colspan ?? 1) > 1 ||
                (cell.attrs?.rowspan ?? 1) > 1
              )
                throw Error(
                  "병합된 표 셀은 지원하지 않습니다. 원본에서 셀 병합을 해제한 뒤 붙여넣어 주세요.",
                );
              return textOf(cell);
            });
            const original = old && blockValue(old).cells;
            return {
              ...(old ?? {}),
              id: identity(old),
              type: "table_row",
              table_row: {
                ...(old ? blockValue(old) : {}),
                cells:
                  original &&
                  JSON.stringify(original.map(normalized)) ===
                    JSON.stringify(cells)
                    ? original
                    : cells,
              },
            };
          });
          return [
            {
              ...(source ?? {}),
              id: identity(source),
              type: "table",
              table: {
                ...(source ? blockValue(source) : {}),
                table_width: node.content?.[0]?.content?.length ?? 0,
                has_column_header:
                  node.content?.[0]?.content?.every(
                    (c) => c.type === "tableHeader",
                  ) ?? false,
                has_row_header:
                  node.content?.every(
                    (r) => r.content?.[0]?.type === "tableHeader",
                  ) ?? false,
              },
              children: rows,
            },
          ];
        }
        case "noticeAsset": {
          const block = node.attrs?.block as ContentBlock;
          if (!block?.id || !block.type)
            throw Error("첨부 요소를 확인해 주세요.");
          return [{ ...block, id: identity(block) }];
        }
        default:
          throw Error(`저장할 수 없는 본문 요소입니다: ${node.type}`);
      }
    });
  return walk(document.content ?? []);
}
