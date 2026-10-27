import { useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { ContentBlock } from "../lib/notion-model";
import type { RichText } from "../lib/content-model";
import { blockValue } from "../lib/notion-model";
import { api } from "./server-storage";
import { photo } from "./notice-editor";
const names: Record<string, string> = {
  paragraph: "본문",
  heading_1: "큰 제목",
  heading_2: "제목",
  heading_3: "소제목",
  bulleted_list_item: "글머리표",
  numbered_list_item: "번호 목록",
  quote: "인용",
  callout: "안내 상자",
  divider: "구분선",
  image: "사진",
  pdf: "PDF 첨부",
  file: "첨부파일",
  table: "표",
  table_row: "표 행",
  to_do: "체크 목록",
  toggle: "접기",
  code: "코드",
  bookmark: "링크",
};
import { markdown, rich } from "../cms/rich-text";
export function newCmsBlock(type = "paragraph"): ContentBlock {
  const id = crypto.randomUUID().replaceAll("-", "");
  return type === "table"
    ? {
        id,
        type,
        table: { table_width: 3, has_column_header: true },
        children: Array.from({ length: 3 }, () => ({
          id: crypto.randomUUID().replaceAll("-", ""),
          type: "table_row",
          table_row: { cells: [[], [], []] },
        })),
      }
    : { id, type, [type]: { rich_text: [] } };
}
function richView(parts: RichText[] = []) {
  return parts.map((p, i) => (
    <span
      key={i}
      style={{
        fontWeight: p.annotations?.bold ? 700 : undefined,
        fontStyle: p.annotations?.italic ? "italic" : undefined,
        textDecoration:
          [
            p.annotations?.underline ? "underline" : "",
            p.annotations?.strikethrough ? "line-through" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      }}
    >
      {p.href ? (
        <a href={p.href} target="_blank" rel="noopener noreferrer">
          {p.plain_text ?? p.text?.content}
        </a>
      ) : (
        (p.plain_text ?? p.text?.content)
      )}
    </span>
  ));
}
export function mediaUrl(input: string) {
  const url = input.startsWith("https://pnusmp.com/api/cms-media/")
    ? input.slice("https://pnusmp.com".length)
    : input;
  return url.startsWith("/api/cms-media/")
    ? url.replace("/api/cms-media/", "/api/cms/media/")
    : url.startsWith("/")
      ? "https://pnusmp.com" + url
      : url;
}
export function CmsBlocksPreview({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="cms-prose">
      {blocks.map((b) => {
        const v = blockValue(b),
          url = v.external?.url ?? v.file?.url ?? v.url ?? "";
        return (
          <div key={b.id} className={`cms-block-${b.type}`}>
            {b.type === "divider" ? (
              <hr />
            ) : b.type === "image" ? (
              <figure>
                <img
                  src={mediaUrl(url)}
                  alt={
                    v.caption
                      ?.map((t) => t.plain_text ?? t.text?.content)
                      .join("") ?? ""
                  }
                />
                <figcaption>{richView(v.caption)}</figcaption>
              </figure>
            ) : ["file", "pdf", "bookmark"].includes(b.type) ? (
              <a href={mediaUrl(url)} target="_blank" rel="noopener noreferrer">
                {v.name || richView(v.caption) || "첨부파일"}
              </a>
            ) : b.type === "table" ? (
              <table>
                <tbody>
                  {b.children?.map((row) => (
                    <tr key={row.id}>
                      {blockValue(row).cells?.map((cell, i) => (
                        <td key={i}>{richView(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <>
                {b.type === "bulleted_list_item"
                  ? "• "
                  : b.type === "numbered_list_item"
                    ? "› "
                    : b.type === "to_do"
                      ? v.checked
                        ? "☑ "
                        : "☐ "
                      : ""}
                {richView(v.rich_text)}
              </>
            )}
            {b.type !== "table" && b.children && (
              <CmsBlocksPreview blocks={b.children} />
            )}
          </div>
        );
      })}
    </div>
  );
}
export function CmsBlocks({
  id,
  blocks,
  onChange,
  disabled = false,
}: {
  id: string;
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState("paragraph"),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const change = (index: number, b: ContentBlock) =>
    onChange(blocks.map((v, i) => (i === index ? b : v)));
  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const image = file.type.startsWith("image/"),
        body = image ? await photo(file) : file;
      const r = await api(`/cms/entry/${id}/${image ? "image" : "file"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body,
      });
      const { url } = await r.json(),
        type = image
          ? "image"
          : file.type === "application/pdf"
            ? "pdf"
            : "file";
      onChange([
        ...blocks,
        {
          id: crypto.randomUUID().replaceAll("-", ""),
          type,
          [type]: {
            type: "external",
            external: { url },
            name: file.name,
            caption: [],
          },
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <fieldset className="cms-block-editor" disabled={disabled || uploading}>
      <legend>본문</legend>
      <p className="section-description">
        **굵게**, *기울임*, ~~취소선~~, &lt;u&gt;밑줄&lt;/u&gt;,
        [링크](https://…)를 사용할 수 있습니다. 기존 표·사진·첨부와 글자 서식은
        유지됩니다.
      </p>
      {blocks.map((b, index) => {
        const v = blockValue(b);
        return (
          <section className="cms-edit-block" key={b.id}>
            <header>
              <strong>{names[b.type] ?? b.type}</strong>
              <span>
                <button
                  type="button"
                  aria-label="위로"
                  disabled={index === 0}
                  onClick={() => {
                    const a = [...blocks];
                    [a[index - 1], a[index]] = [a[index], a[index - 1]];
                    onChange(a);
                  }}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label="아래로"
                  disabled={index === blocks.length - 1}
                  onClick={() => {
                    const a = [...blocks];
                    [a[index + 1], a[index]] = [a[index], a[index + 1]];
                    onChange(a);
                  }}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  aria-label="블록 삭제"
                  onClick={() => onChange(blocks.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </header>
            {b.type === "table" ? (
              <>
                <div className="cms-table-editor">
                  <table>
                    <tbody>
                      {b.children?.map((row, ri) => (
                        <tr key={row.id}>
                          {blockValue(row).cells?.map((cell, ci) => (
                            <td key={ci}>
                              <textarea
                                aria-label={`${ri + 1}행 ${ci + 1}열`}
                                value={markdown(cell)}
                                onChange={(e) =>
                                  change(index, {
                                    ...b,
                                    children: b.children?.map((r, j) =>
                                      j !== ri
                                        ? r
                                        : {
                                            ...r,
                                            table_row: {
                                              ...blockValue(r),
                                              cells: blockValue(r).cells?.map(
                                                (c, k) =>
                                                  k === ci
                                                    ? rich(e.target.value)
                                                    : c,
                                              ),
                                            },
                                          },
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    change(index, {
                      ...b,
                      children: [
                        ...(b.children ?? []),
                        {
                          id: crypto.randomUUID().replaceAll("-", ""),
                          type: "table_row",
                          table_row: {
                            cells: Array.from(
                              {
                                length:
                                  blockValue(
                                    b.children?.[0] ?? {
                                      id: "",
                                      type: "table_row",
                                    },
                                  ).cells?.length ?? 3,
                              },
                              () => [],
                            ),
                          },
                        },
                      ],
                    })
                  }
                >
                  표 행 추가
                </button>
              </>
            ) : ["image", "pdf", "file"].includes(b.type) ? (
              <>
                <CmsBlocksPreview blocks={[b]} />
                <input
                  aria-label="설명"
                  value={markdown(v.caption)}
                  onChange={(e) =>
                    change(index, {
                      ...b,
                      [b.type]: { ...v, caption: rich(e.target.value) },
                    })
                  }
                />
              </>
            ) : b.type === "divider" ? (
              <hr />
            ) : b.type === "bookmark" ? (
              <input
                aria-label="링크 주소"
                value={v.url ?? ""}
                onChange={(e) =>
                  change(index, {
                    ...b,
                    [b.type]: { ...v, url: e.target.value },
                  })
                }
              />
            ) : (
              <textarea
                rows={b.type.startsWith("heading") ? 1 : 3}
                aria-label={`${index + 1}번째 ${names[b.type]}`}
                value={markdown(v.rich_text)}
                onChange={(e) =>
                  change(index, {
                    ...b,
                    [b.type]: { ...v, rich_text: rich(e.target.value) },
                  })
                }
              />
            )}
            {b.children && b.type !== "table" && (
              <CmsBlocks
                id={id}
                blocks={b.children}
                onChange={(children) => change(index, { ...b, children })}
              />
            )}
          </section>
        );
      })}
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <div className="cms-actions">
        <select
          aria-label="추가할 본문 요소"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {Object.entries(names)
            .filter(([k]) => !["image", "pdf", "file", "table_row"].includes(k))
            .map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => onChange([...blocks, newCmsBlock(kind)])}
        >
          <Plus size={14} />
          요소 추가
        </button>
        <label className="file-picker">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,.pdf,.zip"
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
          {uploading ? "파일 준비 중…" : "사진·첨부 추가"}
        </label>
      </div>
      <small>
        사진은 자동 압축합니다. PDF·ZIP 첨부는 1.4 MB 이하입니다. 리포트 PDF는
        ‘PDF 등록’에서 올려주세요.
      </small>
    </fieldset>
  );
}
