import { useEffect, useState } from "react";
import { ArrowLeft, Eye, PenLine, Settings2, Check } from "lucide-react";
import type { ContentItem } from "../../lib/content-model";
import { CmsBlocksPreview } from "../cms-blocks";
import { InlineLoading } from "../ui/loading";
import { Field } from "../cms/field";
import { status, statusTone } from "../cms/presentation";
import type { EntryEditorProps } from "../cms/entry-editor";
import { NoticeComposer } from "./composer";
import "./workspace.css";
import { PublicationButtons, PublicationFeedback } from "../cms/publication-controls";

export function NoticeWorkspace(props: EntryEditorProps) {
  const {
    selected,
    form,
    busy,
    dirty,
    onBack,
    onSave,
    onAction,
    change,
    onBlocks,
    onBusy,
  } = props;
  const item = form.item as ContentItem;
  const [preview, setPreview] = useState(false),
    [problem, setProblem] = useState("");
  // A pasted shape that cannot be serialized is still an unsaved edit.
  useEffect(() => {
    props.onDirty?.(!!problem);
    return () => props.onDirty?.(false);
  }, [problem, props.onDirty]);
  const readonly = busy || !!selected.trashedAt;
  return (
    <section className="notice-workspace" aria-label="공지 작성">
      <header className="notice-workspace-header">
        <div className="notice-heading">
          <button onClick={onBack} disabled={busy} aria-label="공지 목록으로">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>공지 작성</h1>
            <span className={`status-badge ${statusTone(selected)}`}>
              {dirty ? "저장 전 변경" : status(selected)}
            </span>
          </div>
        </div>
        <div className="notice-publish-actions">
          <span className="notice-save-status" role="status">
            {busy ? (
              <InlineLoading>처리 중…</InlineLoading>
            ) : dirty ? (
              "저장하지 않은 변경사항"
            ) : (
              <>
                <Check size={14} />
                초안 저장됨
              </>
            )}
          </span>
          <button
            disabled={busy}
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? <PenLine size={16} /> : <Eye size={16} />}{" "}
            {preview ? "계속 작성" : "미리보기"}
          </button>
          <PublicationButtons entry={selected} dirty={dirty} busy={busy} invalid={!!problem} onSave={onSave} onPublish={() => onAction("approve")} />
        </div>
      </header>
      {problem && (
        <p role="alert" className="error-panel">
          {problem} 내용을 조정한 뒤 저장해 주세요.
        </p>
      )}
      <PublicationFeedback entry={selected} />
      <div className="notice-workspace-grid">
        <div className="notice-paper">
          <div hidden={preview}>
            <label className="notice-title-label">
              공지 제목
              <textarea
                aria-label="공지 제목"
                placeholder="제목을 입력하세요"
                rows={2}
                maxLength={500}
                disabled={readonly}
                value={item.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <NoticeComposer
              id={selected.id}
              blocks={form.blocks}
              disabled={readonly}
              onChange={onBlocks}
              onBusy={onBusy}
              onProblem={setProblem}
            />
          </div>
          {preview && (
            <article className="notice-preview">
              <p className="notice-preview-label">게시 전 미리보기</p>
              <h2>{item.title || "제목 없음"}</h2>
              <p className="notice-preview-meta">
                {item.category} · {item.date?.slice(0, 10)} · {item.author}
              </p>
              <CmsBlocksPreview blocks={form.blocks} />
            </article>
          )}
        </div>
        <aside className="notice-settings" aria-label="공지 게시 설정">
          <details open>
            <summary>
              <Settings2 size={16} />
              게시 설정
            </summary>
            <fieldset disabled={readonly}>
              <Field
                label="게시일"
                type="date"
                value={item.date?.slice(0, 10)}
                onChange={(v) => change("date", v)}
              />
              <Field
                label="분류"
                value={item.category}
                onChange={(v) => change("category", v)}
              />
              <Field
                label="작성자"
                value={item.author}
                onChange={(v) => change("author", v)}
              />
              <label className="notice-pinned">
                <input
                  type="checkbox"
                  checked={!!item.pinned}
                  onChange={(e) => change("pinned", e.target.checked)}
                />
                상단 고정
              </label>
              <label className="cms-field">
                목록에 표시할 요약
                <textarea
                  rows={4}
                  value={item.summary}
                  onChange={(e) => change("summary", e.target.value)}
                  placeholder="공지 목록에서 보여 줄 짧은 소개 (선택)"
                />
              </label>
            </fieldset>
          </details>
          <p className="notice-settings-help">
            초안 저장 후 ‘게시’를 누르면 사이트에 반영됩니다. 수정 중에는 현재
            공개된 글이 유지됩니다.
          </p>
          <details className="notice-more">
            <summary>공개 상태·삭제</summary>
            <div>
              {selected.trashedAt ? (
                <button disabled={busy} onClick={() => onAction("restore")}>
                  비공개 초안으로 복원
                </button>
              ) : (
                <>
                  <button
                    disabled={busy || dirty || !selected.approvedRevision}
                    onClick={() => onAction("withdraw")}
                  >
                    비공개로 전환
                  </button>
                  <button
                    disabled={busy || dirty}
                    onClick={() => onAction("trash")}
                  >
                    휴지통으로 이동
                  </button>
                </>
              )}
              {!!selected.approvedRevision && !selected.trashedAt && (
                <a
                  href={`https://pnusmp.com/notice/${selected.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  게시된 공지 보기 ↗
                </a>
              )}
            </div>
          </details>
        </aside>
      </div>
    </section>
  );
}
