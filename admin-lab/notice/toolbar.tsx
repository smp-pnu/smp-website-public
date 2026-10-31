import { useId, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link,
  Undo2,
  Redo2,
  ImagePlus,
  Paperclip,
  Table2,
  Minus,
  MessageSquare,
  Unlink,
  X,
} from "lucide-react";
import { safeUrl } from "../../lib/content-model";
import { AdminSelect } from "../ui/select";

export function NoticeToolbar({
  editor,
  disabled,
  onFile,
}: {
  editor: Editor;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false),
    [link, setLink] = useState(""),
    [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const selected = useRef({ from: 1, to: 1 });
  const file = useRef<HTMLInputElement>(null);
  const command = (action: () => void) => {
    if (!disabled) action();
  };
  const button = (
    name: string,
    icon: React.ReactNode,
    action: () => void,
    active?: boolean,
    unavailable = false,
  ) => (
    <button
      key={name}
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={active}
      disabled={disabled || unavailable}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => command(action)}
    >
      {icon}
    </button>
  );
  return (
    <div className="notice-toolbar">
      <div className="notice-format-row" role="group" aria-label="본문 서식">
        {button(
          "실행 취소",
          <Undo2 />,
          () => editor.chain().focus().undo().run(),
          undefined,
          !editor.can().undo(),
        )}
        {button(
          "다시 실행",
          <Redo2 />,
          () => editor.chain().focus().redo().run(),
          undefined,
          !editor.can().redo(),
        )}
        <span className="notice-tool-divider" />
        <AdminSelect
          aria-label="문단 스타일"
          disabled={disabled}
          value={
            editor.isActive("heading")
              ? `h${editor.getAttributes("heading").level}`
              : "paragraph"
          }
          onValueChange={(value) =>
            value === "paragraph"
              ? editor.chain().focus().setParagraph().run()
              : editor
                  .chain()
                  .focus()
                  .setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
                  .run()
          }
        >
          <option value="paragraph">본문</option>
          <option value="h1">큰 제목</option>
          <option value="h2">제목</option>
          <option value="h3">소제목</option>
        </AdminSelect>
        {button(
          "굵게",
          <Bold />,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {button(
          "링크",
          <Link />,
          () => {
            selected.current = {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
            };
            setLink(editor.getAttributes("link").href || "https://");
            setError("");
            setLinkOpen(true);
          },
          editor.isActive("link"),
        )}
        <span className="notice-tool-divider" />
        {button(
          "글머리표",
          <List />,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        <button type="button" disabled={disabled} aria-expanded={moreOpen} aria-controls={moreId} onMouseDown={(e) => e.preventDefault()} onClick={() => setMoreOpen(!moreOpen)}>더보기</button>
      </div>
      <div id={moreId} className="notice-extra-tools" hidden={!moreOpen} role="group" aria-label="추가 서식">
        {button(
          "기울임",
          <Italic />,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        {button(
          "밑줄",
          <Underline />,
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive("underline"),
        )}
        {button(
          "취소선",
          <Strikethrough />,
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
        )}
        {button(
          "번호 목록",
          <ListOrdered />,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        {button(
          "인용",
          <Quote />,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        {button(
          "안내 상자",
          <MessageSquare />,
          () => editor.chain().focus().toggleWrap("noticeCallout").run(),
          editor.isActive("noticeCallout"),
        )}
      </div>
      <div className="notice-insert-row" role="group" aria-label="본문에 추가">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            file.current!.accept = "image/png,image/jpeg,image/webp";
            file.current!.click();
          }}
        >
          <ImagePlus size={16} />
          사진
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            file.current!.accept = ".pdf,.zip";
            file.current!.click();
          }}
        >
          <Paperclip size={16} />
          첨부
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <Table2 size={16} />표
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={16} />
          구분선
        </button>
        <input
          ref={file}
          type="file"
          hidden
          aria-label="공지 사진·첨부 파일 선택"
          onChange={(e) => {
            if (e.target.files?.[0]) onFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
      {editor.isActive("table") && (
        <div className="notice-table-tools" role="group" aria-label="표 편집">
          <button
            disabled={disabled}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            행 추가
          </button>
          <button
            disabled={disabled}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            열 추가
          </button>
          <button
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            행 삭제
          </button>
          <button
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            열 삭제
          </button>
          <button
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            표 삭제
          </button>
        </div>
      )}
      {linkOpen && (
        <form
          className="notice-link-form"
          onSubmit={(e) => {
            e.preventDefault();
            const url = safeUrl(link);
            if (!url) {
              setError("https://로 시작하는 주소를 입력해 주세요.");
              return;
            }
            const { from, to } = selected.current;
            const chain = editor.chain().focus().setTextSelection({ from, to });
            if (from === to && !editor.isActive("link"))
              chain
                .insertContent({
                  type: "text",
                  text: url,
                  marks: [{ type: "link", attrs: { href: url } }],
                })
                .run();
            else chain.extendMarkRange("link").setLink({ href: url }).run();
            setLinkOpen(false);
          }}
        >
          <label>
            링크 주소
            <input
              autoFocus
              type="url"
              value={link}
              placeholder="https://…"
              disabled={disabled}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setLinkOpen(false);
                  editor.commands.focus();
                }
              }}
            />
          </label>
          <button type="submit" disabled={disabled}>
            적용
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              editor
                .chain()
                .focus()
                .setTextSelection(selected.current)
                .extendMarkRange("link")
                .unsetLink()
                .run();
              setLinkOpen(false);
            }}
            aria-label="링크 해제"
          >
            <Unlink size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkOpen(false);
              editor.commands.focus();
            }}
            aria-label="링크 입력 닫기"
          >
            <X size={16} />
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
