import type { Entry } from "../../cms/model";
export const names = {
  research: "리포트",
  notice: "공지사항",
  members: "회원 명단",
};
export const status = (e: Entry) =>
  e.trashedAt
    ? "휴지통"
    : e.error
      ? "게시 준비 실패"
      : e.pending
        ? "PDF 준비 중"
        : e.approvedRevision === e.revision
          ? "게시됨"
          : e.approvedRevision
            ? "수정 초안"
            : "비공개 초안";
export const title = (e: Entry) =>
  "name" in e.draft.item ? e.draft.item.name : e.draft.item.title;
export const statusTone = (e: Entry) =>
  e.trashedAt ? "muted" : e.error ? "error" : e.pending ? "pending" :
  e.approvedRevision === e.revision ? "ready" : e.approvedRevision ? "edited" : "draft";
