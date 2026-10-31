import { PublicationButtons, PublicationFeedback } from "./publication-controls";
import { AdminSelect } from "../ui/select";
import { useState } from "react";
import { ArrowLeft, ImagePlus } from "lucide-react";
import type { Entry, Payload, Kind } from "../../cms/model";
import type { ContentItem } from "../../lib/content-model";
import type { Member } from "../../lib/member-model";
import { CmsBlocks, CmsBlocksPreview, mediaUrl } from "../cms-blocks";
import { Field } from "./field";
import { names, status, statusTone } from "./presentation";
import type { CmsAction } from "../cms-bulk";
import { NoticeWorkspace } from "../notice/workspace";
export type EntryEditorProps = {
  selected: Entry;
  form: Payload;
  group: string;
  busy: boolean;
  onBusy?: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
  dirty: boolean;
  onBack: () => void;
  onSave: () => void;
  onReplacePdf: () => void;
  onAction: (action: CmsAction) => void;
  change: (key: string, value: unknown) => void;
  onPhoto: (file: File) => Promise<void>;
  onBlocks: (blocks: Payload["blocks"]) => void;
};
export function EntryEditor({
  selected,
  form,
  group,
  busy,
  onBusy,
  onDirty,
  dirty,
  onBack,
  onSave,
  onReplacePdf,
  onAction,
  change,
  onPhoto,
  onBlocks,
}: EntryEditorProps) {
  const section: Kind = selected.kind;
  const [preview, setPreview] = useState(false);
  const selectedContent = form.item as ContentItem,
    member = form.item as Member;
  if (section === "notice") return <NoticeWorkspace key={selected.id} {...{ selected, form, group, busy, onBusy, onDirty, dirty, onBack, onSave, onReplacePdf, onAction, change, onPhoto, onBlocks }}/>;
  return (
    <>
      <div className="detail-navigation">
        <button disabled={busy} onClick={() => onBack()}>
          <ArrowLeft size={15} />
          {section === "members" ? `${group || member.generation}기 명단으로` : "목록으로"}
        </button>
        <span className={`status-badge ${dirty ? "edited" : statusTone(selected)}`}>{dirty ? "저장 전 변경" : status(selected)}</span>
      </div>
      <header className="page-heading">
        <div>
          <h1>{names[section]} 편집</h1>
          <p>
            {selected.source === "notion"
              ? "기존 자료의 주소와 파일은 그대로 유지됩니다."
              : "저장한 초안은 게시 버튼을 눌러야 공개됩니다."}
          </p>
        </div>
        <div className="cms-actions">
          {section === "research" && (
            <button
              disabled={busy || dirty || !!selected.trashedAt}
              onClick={() => void onReplacePdf()}
            >
              PDF 교체
            </button>
          )}
          <PublicationButtons entry={selected} dirty={dirty} busy={busy} onSave={onSave} onPublish={() => onAction("approve")} />
        </div>
      </header>
      <PublicationFeedback entry={selected} />
      {dirty && (
        <p className="field-help" role="status">
          수정한 내용을 ‘초안 저장’한 뒤 ‘게시’를 누르면 사이트에 반영됩니다.
        </p>
      )}
      <fieldset className="cms-form" disabled={busy || !!selected.trashedAt}>
        {section === "members" ? (
          <>
            <Field
              label="이름"
              value={member?.name}
              onChange={(v) => change("name", v)}
            />
            <Field
              label="기수"
              value={member?.generation}
              type="number"
              onChange={(v) => change("generation", Number(v))}
            />
            <label className="cms-field">
              구분
              <AdminSelect disabled={busy || !!selected.trashedAt} aria-label="회원 표시 위치"
                value={member?.group ?? "members"}
                onValueChange={(next) => change("group", next)}
              >
                <option value="members">MEMBERS · 활동 회원</option>
                <option value="alumni">ALUMNI · 수료 회원</option>
              </AdminSelect>
            </label>
            <Field
              label="학과"
              value={member?.department}
              onChange={(v) => change("department", v)}
            />
            <Field
              label="학번 표시"
              hint="입학연도 두 자리만 입력합니다. 예: 26"
              value={member?.year}
              onChange={(v) => change("year", v)}
            />
            <div className="cms-field">
              <span>직책</span>
              <div className="cms-actions">
                {["회장", "부회장", "기장"].map((role) => (
                  <label key={role}>
                    <input
                      type="checkbox"
                      checked={member?.roles?.includes(role as never) ?? false}
                      onChange={(e) =>
                        change(
                          "roles",
                          e.target.checked
                            ? [...(member?.roles ?? []), role]
                            : (member?.roles ?? []).filter((r) => r !== role),
                        )
                      }
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
            <div className="cms-field">
              <span>프로필 사진</span>
              {member?.image && (
                <img
                  className="cms-avatar"
                  src={mediaUrl(member.image)}
                  alt="프로필"
                />
              )}
              <label className={`secondary file-picker member-photo-picker ${busy || selected.trashedAt ? "disabled" : ""}`}>
                <ImagePlus size={16} />{member.image ? "사진 변경" : "사진 선택"}
                <input
                type="file"
                aria-label="회원 프로필 사진 선택"
                disabled={busy || !!selected.trashedAt}
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) void onPhoto(e.target.files[0]);
                  e.target.value = "";
                }}
                />
              </label>
              {member?.image && (
                <button onClick={() => change("image", undefined)}>
                  사진 내리기
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <fieldset className="cms-form-section">
              <legend>기본 정보</legend>
              <Field wide label="제목" value={selectedContent.title} onChange={(v) => change("title", v)} />
              <Field label="게시일" type="date" value={selectedContent.date?.slice(0, 10)} onChange={(v) => change("date", v)} />
              <Field label="작성자·팀" value={selectedContent.author} onChange={(v) => change("author", v)} />
              <label className="cms-field cms-wide">요약
                <textarea rows={3} value={selectedContent.summary ?? ""} onChange={(e) => change("summary", e.target.value)} />
              </label>
            </fieldset>
            <fieldset className="cms-form-section">
              <legend>기업 정보</legend>
              <Field label="기업명" value={selectedContent.company} onChange={(v) => change("company", v)} />
              <Field label="종목코드" value={selectedContent.ticker} onChange={(v) => change("ticker", v)} />
              <Field wide label="업종" value={selectedContent.industry} onChange={(v) => change("industry", v)} />
            </fieldset>
            <fieldset className="cms-form-section">
              <legend>분류·노출</legend>
              <Field label="학기" hint="예: 2026-2" value={selectedContent.semester} onChange={(v) => change("semester", v || undefined)} />
              <Field label="표시 분류" hint="목록 카드에 표시할 분류입니다. 예: 기업분석, 신입세션" value={selectedContent.category} onChange={(v) => change("category", v)} />
              <Field label="보고서 종류" hint="기업분석·산업분석 등 보고서의 성격" value={selectedContent.reportType} onChange={(v) => change("reportType", v)} />
              <Field label="활동" hint="정규 리서치·대회 등 작성한 활동" value={selectedContent.activity} onChange={(v) => change("activity", v)} />
            </fieldset>
          </>
        )}
      </fieldset>
      {section !== "members" && (
        <>
          <div className="cms-actions">
            <button
              disabled={busy}
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
            >
              본문 편집
            </button>
            <button
              disabled={busy}
              aria-pressed={preview}
              onClick={() => setPreview(true)}
            >
              미리보기
            </button>
          </div>
          {preview ? (
            <CmsBlocksPreview blocks={form.blocks} />
          ) : (
            <CmsBlocks
              id={selected.id}
              onBusy={onBusy}
              blocks={form.blocks}
              disabled={busy || !!selected.trashedAt}
              onChange={(blocks) => onBlocks(blocks)}
            />
          )}
        </>
      )}
      <footer className="cms-actions cms-footer">
        {selected.trashedAt ? (
          <button disabled={busy} onClick={() => void onAction("restore")}>
            비공개 초안으로 복원
          </button>
        ) : (
          <>
            <button
              disabled={busy || dirty || !selected.approvedRevision}
              onClick={() => void onAction("withdraw")}
            >
              비공개로 전환
            </button>
            <button
              disabled={busy || dirty}
              onClick={() => void onAction("trash")}
            >
              휴지통으로 이동
            </button>
          </>
        )}
        {selected.kind !== "members" &&
          !selected.trashedAt &&
          selected.approvedRevision && (
            <a
              href={`https://pnusmp.com/${selected.kind}/${selected.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              게시된 페이지 보기 ↗
            </a>
          )}
      </footer>
    </>
  );
}
