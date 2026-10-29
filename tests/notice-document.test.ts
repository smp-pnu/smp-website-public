import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noticeBlocks,
  noticeDocument,
  inlineDocument,
  inlineRich,
} from "../admin-lab/notice/document";
import { validateBlocks } from "../cms/model";
import { blockValue, type ContentBlock } from "../lib/notion-model";
const id = (n: number) => n.toString(16).padStart(32, "0");
const rich = [
  {
    plain_text: "안내 문구",
    text: { content: "안내 문구" },
    annotations: { bold: true, underline: true },
    href: "https://pnusmp.com/",
  },
];
const block = (type: string, n: number, values = {}): ContentBlock => ({
  id: id(n),
  type,
  [type]: { rich_text: rich, ...values },
});
test("notice visual editor round-trips text, formatting, images, attachments and nested legacy blocks without loss", () => {
  const blocks = [
    block("paragraph", 1),
    block("heading_2", 2),
    block("quote", 3),
    block("callout", 4),
    block("bulleted_list_item", 5),
    block("bulleted_list_item", 6),
    block("numbered_list_item", 7),
    { id: id(8), type: "divider", divider: {} },
    {
      id: id(9),
      type: "image",
      image: { external: { url: `/api/cms-media/${id(99)}` }, caption: rich },
    },
    {
      id: id(10),
      type: "file",
      file: {
        external: { url: "https://pnusmp.com/file.pdf" },
        name: "규정.pdf",
        caption: rich,
      },
    },
    { ...block("toggle", 11), children: [block("paragraph", 12)] },
    block("to_do", 13, { checked: true }),
  ];
  const before = JSON.stringify(blocks),
    result = noticeBlocks(noticeDocument(blocks));
  assert.deepEqual(result, blocks);
  assert.equal(JSON.stringify(blocks), before);
  validateBlocks(result);
});
test("tables preserve every cell and row identity, and code keeps newlines", () => {
  const table = {
    id: id(1),
    type: "table",
    table: { table_width: 2, has_column_header: true, has_row_header: false },
    children: [1, 2].map((n) => ({
      id: id(n + 1),
      type: "table_row",
      table_row: { cells: [rich, [{ text: { content: "둘째\n줄" } }]] },
    })),
  };
  const code = block("code", 4, {
    rich_text: [{ text: { content: "a\nb" } }],
    language: "javascript",
  });
  const result = noticeBlocks(noticeDocument([table, code]));
  assert.deepEqual(result, [table, code]);
  validateBlocks(result);
});
test("format changes use the existing schema; duplicated source IDs from split paragraphs become unique", () => {
  const original = block("paragraph", 1),
    doc = noticeDocument([original]);
  doc.content![0].type = "heading";
  doc.content![0].attrs!.level = 2;
  doc.content![0].content = [
    { type: "text", text: "수정한 제목", marks: [{ type: "italic" }] },
  ];
  doc.content!.push({ ...doc.content![0] });
  const result = noticeBlocks(doc);
  validateBlocks(result);
  assert.equal(result[0].type, "heading_2");
  assert.equal(result[0].paragraph, undefined);
  assert.equal(blockValue(result[0]).rich_text?.[0].annotations?.italic, true);
  assert.notEqual(result[0].id, result[1].id);
  assert.equal(result[0].id, original.id);
});
test("nested new lists and multi-line quote preserve all text; unsupported nodes fail instead of dropping content", () => {
  const output = noticeBlocks({
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "부모" }] },
              {
                type: "orderedList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "자식" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "첫째" }] },
          { type: "paragraph", content: [{ type: "text", text: "둘째" }] },
        ],
      },
    ],
  });
  validateBlocks(output);
  assert.equal(output[0].children?.[0].type, "numbered_list_item");
  assert.equal(
    blockValue(output[1])
      .rich_text?.map((x) => x.text?.content)
      .join(""),
    "첫째\n둘째",
  );
  assert.throws(
    () =>
      noticeBlocks({
        content: [
          { type: "unknown", content: [{ type: "text", text: "보존해야 함" }] },
        ],
      }),
    /저장할 수 없는/,
  );
});
test("unsafe links are never admitted; mixed annotations and line breaks survive normalization", () => {
  const text = inlineRich(
    inlineDocument([
      {
        text: { content: "첫째\n둘째" },
        annotations: { bold: true, italic: true, code: true },
        href: "javascript:alert(1)",
      },
    ]),
  );
  assert.equal(text.map((p) => p.text?.content).join(""), "첫째\n둘째");
  assert.ok(text.every((p) => !p.href));
  assert.equal(text[0].annotations?.bold, true);
});
test("attachments inside quotes and lists stay attached; merged table cells require explicit correction", () => {
  const asset = {
    id: id(5),
    type: "file",
    file: {
      external: { url: "https://pnusmp.com/notice.pdf" },
      name: "규정.pdf",
    },
  };
  for (const type of ["blockquote", "noticeCallout", "bulletList"]) {
    const content = [
      { type: "paragraph", content: [{ type: "text", text: "안내" }] },
      { type: "noticeAsset", attrs: { block: asset } },
    ];
    const result = noticeBlocks({
      content: [
        {
          type,
          content:
            type === "bulletList" ? [{ type: "listItem", content }] : content,
        },
      ],
    });
    assert.deepEqual(result[0].children?.[0], asset);
    validateBlocks(result);
  }
  assert.throws(
    () =>
      noticeBlocks({
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    attrs: { colspan: 2 },
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    /셀 병합/,
  );
});
