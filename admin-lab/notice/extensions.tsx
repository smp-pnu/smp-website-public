import { Extension, Node } from "@tiptap/core";
import { createContext, useContext } from "react";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { GripVertical, Trash2 } from "lucide-react";
import { CmsBlocks, CmsBlocksPreview } from "../cms-blocks";
import { blockValue, type ContentBlock } from "../../lib/notion-model";
import { plainText } from "../../lib/content-model";

// Kept in editor memory only. HTML paste cannot inject CMS IDs or private file references.
export const CmsSource = Extension.create({
  name: "cmsSource",
  addGlobalAttributes: () => [
    {
      types: [
        "paragraph",
        "heading",
        "blockquote",
        "noticeCallout",
        "codeBlock",
        "horizontalRule",
        "listItem",
        "table",
        "tableRow",
      ],
      attributes: {
        source: { default: null, rendered: false, parseHTML: () => null },
      },
    },
  ],
});
export const NoticeCallout = Node.create({
  name: "noticeCallout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "aside[data-notice-callout]" }],
  renderHTML: () => [
    "aside",
    { "data-notice-callout": "", class: "notice-callout" },
    0,
  ],
});
export const NoticeReadOnly = createContext(false);
function AssetView({
  node,
  extension,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const readonly = useContext(NoticeReadOnly);
  const block = node.attrs.block as ContentBlock;
  const value = blockValue(block),
    media = ["image", "file", "pdf"].includes(block.type);
  return (
    <NodeViewWrapper
      className={`notice-asset ${selected ? "is-selected" : ""}`}
      contentEditable={false}
    >
      <div className="notice-asset-tools">
        <span data-drag-handle draggable aria-label="이 요소 끌어서 이동">
          <GripVertical size={16} />
        </span>
        <span>
          {block.type === "image"
            ? "사진"
            : media
              ? "첨부파일"
              : "기존 본문 요소"}
        </span>
        <button
          type="button"
          disabled={readonly}
          onClick={deleteNode}
          aria-label="선택 요소 삭제"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <CmsBlocksPreview blocks={[block]} />
      {media ? (
        <input
          aria-label="사진·첨부 설명"
          placeholder="설명을 입력하세요 (선택)"
          disabled={readonly}
          value={plainText(value.caption)}
          onChange={(e) =>
            updateAttributes({
              block: {
                ...block,
                [block.type]: {
                  ...value,
                  caption: [{ text: { content: e.target.value } }],
                },
              },
            })
          }
        />
      ) : (
        <details>
          <summary>세부 내용 편집</summary>
          <CmsBlocks
            id={extension.options.entryId}
            blocks={[block]}
            allowAppend={false}
            allowUpload={false}
            disabled={readonly}
            onChange={(blocks) =>
              blocks[0] ? updateAttributes({ block: blocks[0] }) : deleteNode()
            }
          />
        </details>
      )}
    </NodeViewWrapper>
  );
}
export const NoticeAsset = Node.create({
  name: "noticeAsset",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ entryId: "" }),
  addAttributes: () => ({
    block: { default: null, rendered: false, parseHTML: () => null },
  }),
  // Assets are admitted only after the authenticated upload or existing CMS data conversion.
  parseHTML: () => [],
  renderHTML: () => ["div", { "data-notice-asset": "" }],
  addNodeView: () => ReactNodeViewRenderer(AssetView),
});
