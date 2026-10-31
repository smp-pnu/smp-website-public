import type { Entry } from "../../cms/model";
import { InlineLoading } from "../ui/loading";

export function publicationState(entry: Entry, dirty: boolean, busy = false, invalid = false) {
  const current = entry.approvedRevision === entry.revision && !entry.error;
  return {
    saveDisabled: busy || !dirty || !!entry.trashedAt || invalid,
    publishDisabled: busy || dirty || !!entry.trashedAt || invalid ||
      (entry.pending && !entry.error) || current,
    // Unsaved edits must not still describe the form as already published.
    label: dirty ? "게시" : entry.error ? "다시 게시" : entry.pending ? "게시 준비 중" : current ? "게시됨" : "게시",
  };
}

export function PublicationButtons({ entry, dirty, busy, invalid = false, onSave, onPublish }: {
  entry: Entry; dirty: boolean; busy: boolean; invalid?: boolean;
  onSave: () => void; onPublish: () => void;
}) {
  const state = publicationState(entry, dirty, busy, invalid);
  return <>
    <button disabled={state.saveDisabled} onClick={onSave}>초안 저장</button>
    <button className="primary" disabled={state.publishDisabled} onClick={onPublish}>
      {entry.pending && !entry.error && !dirty ? <InlineLoading>{state.label}</InlineLoading> : state.label}
    </button>
  </>;
}

export function PublicationFeedback({ entry }: { entry: Entry }) {
  if (entry.error) return <p className="error-panel" role="alert">
    게시 준비에 실패했습니다. 파일 연결을 확인하고 ‘다시 게시’를 눌러 주세요. 기존 공개본은 유지됩니다.
  </p>;
  if (!entry.pending) return null;
  return <p className="publication-note" role="status">
    <strong>PDF 전체 페이지를 준비하고 있습니다.</strong>
    작업은 보통 15분 이내 시작합니다. 이 화면을 닫아도 계속 진행되며, 준비가 끝나면 자동으로 공개됩니다.
    {entry.approvedRevision ? " 그동안 기존 공개본은 유지됩니다." : " 아직 공식 사이트에는 표시되지 않습니다."}
  </p>;
}
