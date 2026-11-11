import { useState } from "react";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import type { Entry } from "../../cms/model";
import { InlineLoading } from "../ui/loading";

function BannerImage({ url, title }: { url: string; title: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return <div className="report-share-image" aria-busy={state === "loading"}>
    {state !== "error" && <img key={attempt} src={url} width={2400} height={1260}
      alt={`${title} · 카카오톡 공유 배너`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      className={state === "ready" ? "is-ready" : ""}
      onLoad={() => setState("ready")} onError={() => setState("error")} />}
    {state === "loading" && <div className="report-share-image-status"><InlineLoading>배너 불러오는 중</InlineLoading></div>}
    {state === "error" && <div className="report-share-image-status" role="status">
      <ImageIcon size={24} aria-hidden="true" />
      <span>배너를 불러오지 못했어요.</span>
      <button type="button" onClick={() => { setState("loading"); setAttempt(n => n + 1); }}>다시 불러오기</button>
    </div>}
  </div>;
}

export function ReportSharePreview({ entry, dirty }: { entry: Entry; dirty: boolean }) {
  if (entry.kind !== "research") return null;
  const preview = !entry.trashedAt && entry.approvedRevision ? entry.sharePreview : null;
  const valid = preview && /^[a-f0-9]{32}$/.test(entry.id) && new RegExp(`^/report-shares/${entry.id}/v2-[a-f0-9]{64}-[a-f0-9]{16}\\.jpg$`).test(preview.url);
  const url = valid ? `https://pnusmp.com${preview.url}` : null;
  const changed = dirty || entry.revision !== entry.approvedRevision;
  const label = url ? "현재 공개본" : entry.trashedAt ? "휴지통" : entry.pending ? "게시 준비 중" : entry.approvedRevision ? "확인 필요" : "게시 전";
  return <section className="report-share-preview" aria-labelledby={`report-share-heading-${entry.id}`}>
    <header>
      <div><h2 id={`report-share-heading-${entry.id}`}>카카오톡 공유 배너</h2><span className="status-badge">{label}</span></div>
      {url && <a href={url} target="_blank" rel="noopener noreferrer">크게 보기<ExternalLink size={14} aria-hidden="true" /></a>}
    </header>
    {url && preview ? <BannerImage key={url} url={url} title={preview.title} /> : <div className="report-share-empty" role="status">
      <ImageIcon size={28} aria-hidden="true" />
      <strong>{entry.trashedAt ? "복원한 뒤 게시하면 배너가 준비됩니다." : entry.pending ? "게시 준비가 끝나면 배너가 표시됩니다." : entry.approvedRevision ? "공개 배너 정보를 확인하지 못했어요." : "리포트를 게시하면 자동으로 생성됩니다."}</strong>
      <span>{entry.approvedRevision && !entry.pending && !entry.trashedAt ? "화면을 새로고침한 뒤 다시 확인해 주세요." : "표지·기업명·제목을 사용하며, 별도 이미지 등록은 필요 없습니다."}</span>
    </div>}
    {url && <p className="report-share-caption">{entry.pending ? "새 게시본을 준비하는 동안 기존 공개 배너를 표시합니다." : changed ? "현재 공개된 배너입니다. 수정한 초안을 게시하면 변경 사항이 반영됩니다." : "공식 사이트에서 제공하는 공유 이미지입니다."} 카카오톡에 저장된 미리보기는 갱신 시점이 다를 수 있습니다.</p>}
  </section>;
}
