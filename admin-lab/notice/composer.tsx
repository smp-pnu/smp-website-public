import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit, TableCell, TableHeader } from "@tiptap/extension-table";
import { validateBlocks } from "../../cms/model";
import { safeUrl } from "../../lib/content-model";
import type { ContentBlock } from "../../lib/notion-model";
import { api } from "../server-storage";
import { photo } from "../notice-editor";
import { InlineLoading } from "../ui/loading";
import { noticeBlocks, noticeDocument, newBlockId } from "./document";
import {
  CmsSource,
  NoticeAsset,
  NoticeCallout,
  NoticeReadOnly,
} from "./extensions";
import { NoticeToolbar } from "./toolbar";

type Props = {
  id: string;
  blocks: ContentBlock[];
  disabled: boolean;
  onChange: (blocks: ContentBlock[]) => void;
  onBusy?: (busy: boolean) => void;
  onProblem: (message: string) => void;
};
export function NoticeComposer(props: Props) {
  const [initialDocument] = useState(() => noticeDocument(props.blocks));
  const latest = useRef(props);
  latest.current = props;
  const emitted = useRef(props.blocks),
    uploadController = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const uploadRef = useRef<(file: File, position?: number) => void>(() => {});
  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            autolink: false,
            linkOnPaste: true,
            isAllowedUri: (url) => !!safeUrl(url),
          },
          trailingNode: false,
        }),
        TableKit.configure({
          table: { resizable: false },
          tableCell: false,
          tableHeader: false,
        }),
        TableCell.extend({ content: "paragraph+" }),
        TableHeader.extend({ content: "paragraph+" }),
        CmsSource,
        NoticeCallout,
        NoticeAsset.configure({ entryId: props.id }),
      ],
    content: initialDocument,
      editorProps: {
        attributes: {
          class: "notice-document",
          role: "textbox",
          "aria-label": "공지 본문",
          "aria-multiline": "true",
          "data-placeholder":
            "공지 내용을 작성하세요. 사진·첨부는 끌어서 추가하세요.",
        },
        handleDrop: (view, event) => {
          const files = event.dataTransfer?.files;
          if (!files?.length) return false;
          event.preventDefault();
          if (files.length > 1) {
            setError("사진·첨부는 한 개씩 추가해 주세요.");
            return true;
          }
          uploadRef.current(
            files[0],
            view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos,
          );
          return true;
        },
        handlePaste: (_view, event) => {
          const files = event.clipboardData?.files;
          if (!files?.length) return false;
          event.preventDefault();
          if (files.length > 1) {
            setError("사진·첨부는 한 개씩 추가해 주세요.");
            return true;
          }
          uploadRef.current(files[0]);
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        try {
          const blocks = noticeBlocks(editor.getJSON());
          emitted.current = blocks;
          latest.current.onChange(blocks);
          validateBlocks(blocks);
          latest.current.onProblem("");
        } catch (e) {
          latest.current.onProblem((e as Error).message);
        }
      },
    },
    [props.id],
  );
  useEffect(() => {
    editor?.setEditable(!props.disabled && !uploading, false);
  }, [editor, props.disabled, uploading]);
  useEffect(() => {
    if (
      editor &&
      props.blocks !== emitted.current &&
      JSON.stringify(props.blocks) !== JSON.stringify(emitted.current)
    ) {
      editor.commands.setContent(noticeDocument(props.blocks), {
        emitUpdate: false,
      });
      emitted.current = props.blocks;
    }
  }, [props.blocks, editor]);
  useEffect(
    () => () => {
      uploadController.current?.abort();
      latest.current.onBusy?.(false);
    },
    [],
  );
  const upload = async (file: File, position?: number) => {
    if (!editor || props.disabled || uploadController.current) return;
    const image = /^image\/(png|jpeg|webp)$/.test(file.type),
      attachment = /\.(pdf|zip)$/i.test(file.name);
    if (!image && !attachment) {
      setError("PNG·JPG·WebP 사진 또는 PDF·ZIP 파일을 선택해 주세요.");
      return;
    }
    if (
      (image && file.size > 20 * 1024 * 1024) ||
      (!image && file.size > 1.4 * 1024 * 1024)
    ) {
      setError(
        image
          ? "사진은 20MB 이하로 선택해 주세요. 저장할 때 자동 압축합니다."
          : "공지 첨부는 1.4MB 이하입니다. 기업 리포트는 ‘리포트 등록’을 이용해 주세요.",
      );
      return;
    }
    let bookmark = position ?? editor.state.selection.from;
    // The CMS table cells contain text only; place an attachment after its table.
    const resolved = editor.state.doc.resolve(bookmark);
    for (let depth = resolved.depth; depth > 0; depth--) {
      if (resolved.node(depth).type.name === "table") {
        bookmark = resolved.after(depth);
        break;
      }
    }
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    props.onBusy?.(true);
    setError("");
    editor.setEditable(false, false);
    try {
      const body = image ? await photo(file) : file;
      if (controller.signal.aborted) return;
      const r = await api(
        `/cms/entry/${props.id}/${image ? "image" : "file"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
          body,
          signal: controller.signal,
        },
      );
      const { url } = await r.json();
      if (controller.signal.aborted || editor.isDestroyed) return;
      const type = image ? "image" : /\.pdf$/i.test(file.name) ? "pdf" : "file";
      const block: ContentBlock = {
        id: newBlockId(),
        type,
        [type]: {
          type: "external",
          external: { url },
          name: file.name,
          caption: [],
        },
      };
      const inserted = editor
        .chain()
        .insertContentAt(bookmark, [
          { type: "noticeAsset", attrs: { block } },
          { type: "paragraph" },
        ])
        .focus()
        .run();
      if (!inserted)
        throw Error(
          "파일을 본문에 넣지 못했습니다. 문단을 선택하고 다시 추가해 주세요.",
        );
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      uploadController.current = null;
      if (!controller.signal.aborted) {
        setUploading(false);
        latest.current.onBusy?.(false);
      }
    }
  };
  uploadRef.current = (file, position) => {
    void upload(file, position);
  };
  if (!editor)
    return (
      <div className="notice-editor-loading">
        <InlineLoading>편집기를 준비하는 중…</InlineLoading>
      </div>
    );
  return (
    <div className="notice-composer">
      <NoticeToolbar
        editor={editor}
        disabled={props.disabled || uploading}
        onFile={(file) => void upload(file)}
      />
      {uploading && (
        <div className="notice-upload-state" role="status">
          <InlineLoading>파일을 준비하고 있습니다…</InlineLoading>
        </div>
      )}
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <NoticeReadOnly.Provider value={props.disabled || uploading}>
        <EditorContent editor={editor} />
      </NoticeReadOnly.Provider>
      <p className="notice-editor-hint">
        글자를 선택해 서식을 바꾸세요. Enter로 새 문단, Shift+Enter로 줄바꿈 ·
        ⌘/Ctrl+Z 실행 취소
      </p>
    </div>
  );
}
