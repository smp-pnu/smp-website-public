import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import Link from "next/link";
import { useApi } from "../api";
import { useSearch, Status } from "./state";
import { cachedReportPreview } from "../report-preview";
import { updatePageMetadata } from "../seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NoticeDetailHeader } from "@/components/notice-detail-header";
import { ResearchDetailHeader } from "@/components/research-detail-header";
import { PdfViewer } from "@/components/pdf-viewer";
import { NotionContent } from "@/components/notion-content";
import { contentReturnHref } from "@/lib/content-navigation";
import {
  contentHref,
  safeUrl,
  formatDate,
  type ContentKind,
} from "@/lib/content-model";
import { getPdfSources, isTrustedAttachmentUrl } from "@/lib/pdf-source";
import type { RelatedReports } from "@/lib/related-reports";
import type { ContentBlock } from "@/lib/notion-model";
import type { PreparedItem } from "../grid";
type DetailData = {
  item: PreparedItem;
  blocks: ContentBlock[];
  bodyPending?: boolean;
  related?: RelatedReports;
};
type DetailResult = { value?: DetailData; error?: Error; retry: () => void };
export function DetailPage({ kind }: { kind: ContentKind }) {
  const { id = "" } = useParams();
  const result = useApi<DetailData>(
    `/api/detail/${kind}/${encodeURIComponent(id)}`,
    0,
  );
  return <DetailContent kind={kind} {...result} />;
}
function DetailContent({
  kind,
  value,
  error,
  retry,
}: DetailResult & { kind: ContentKind }) {
  const { id = "" } = useParams();
  const location = useLocation();
  const search = useSearch();
  const confirmedItem = value?.item;
  const item =
    confirmedItem ??
    (!error && kind === "research" ? cachedReportPreview(id) : undefined);
  useEffect(() => {
    if (confirmedItem || error)
      updatePageMetadata(location.pathname + location.search, confirmedItem);
  }, [confirmedItem, error, location.pathname, location.search]);
  // Returning must work before the publication check finishes, including errors.
  const back = contentReturnHref({ kind, id }, search);
  return (
    <>
      <SiteHeader />
      <main
        data-report-page={kind === "research" ? "detail" : undefined}
        className={`relative z-10 mx-auto min-h-[75svh] max-w-4xl px-6 py-16 sm:py-20 ${kind === "notice" ? "notice-content notice-detail" : ""}`}
      >
        <Link href={back} className="text-sm tracking-widest text-site-accent">
          ← {kind.toUpperCase()}
        </Link>
        {item ? (
          <article
            className={kind === "notice" ? "notice-article mt-8" : "mt-10"}
          >
            {kind === "research" ? (
              <ResearchDetailHeader item={item} pending={!value} />
            ) : (
              <NoticeDetailHeader item={item} />
            )}
            {value ? (
              <>
                {kind === "research" && <Attachments item={value.item} />}
                <div className="py-8">
                  {value.bodyPending ? (
                    <p role="status" className="text-site-muted">
                      본문을 준비하고 있습니다. 잠시 후 다시 방문해주세요.
                    </p>
                  ) : (
                    <NotionContent blocks={value.blocks} />
                  )}
                </div>
                {kind === "notice" && <Attachments item={value.item} />}
                {kind === "research" && <Related related={value.related} />}
              </>
            ) : (
              <PendingReport item={item as PreparedItem} />
            )}
          </article>
        ) : (
          <Status error={error} retry={retry} />
        )}
        <div className="mt-14 border-t border-site-line pt-7">
          <Link href={back} className="text-sm text-site-accent">
            목록으로 돌아가기
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
function PendingReport({ item }: { item: PreparedItem }) {
  return (
    <section aria-label="첨부 자료" aria-busy="true" className="mt-8">
      <div className="mt-5">
        <h3 className="mb-4 text-sm text-site-muted">PDF 원문</h3>
        <PdfViewer
          preview={
            item.cover
              ? {
                  url: item.cover.url,
                  width: item.cover.width ?? 595,
                  height: item.cover.height ?? 842,
                  title: item.title,
                }
              : undefined
          }
        />
      </div>
    </section>
  );
}
function Related({ related }: { related?: RelatedReports }) {
  if (!related) return null;
  return (
    <aside
      aria-label="관련 리포트"
      className="mt-12 border-t border-site-line pt-7"
    >
      <h2 className="text-sm font-medium text-site-body">{related.label}</h2>
      <ul className="mt-4 divide-y divide-site-line-soft">
        {related.items.map((report) => (
          <li key={report.id}>
            <Link
              href={contentHref(report)}
              className="flex items-center justify-between gap-4 py-4"
            >
              <span>
                <span className="block text-sm leading-6 text-site-body">
                  {report.title}
                </span>
                <time className="text-xs text-site-muted">
                  {formatDate(report.date)}
                </time>
              </span>
              <span aria-hidden="true">↗</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
function Attachments({ item }: { item: PreparedItem }) {
  const pdfs = getPdfSources(item);
  return (
    <section aria-label="첨부 자료" className="mt-8">
      {pdfs.map((pdf, index) => {
        const url = `/api/content/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.id)}/pdf?${pdf.query}`;
        return (
          <div key={pdf.query} className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm text-site-body">{pdf.name}</h3>
              {(item.kind !== "research" || index > 0) && (
                <a
                  href={`${url}&download=1`}
                  download
                  className="rounded-md bg-sky-300 px-4 py-2 text-sm text-slate-950"
                >
                  PDF 다운로드 ↓
                </a>
              )}
            </div>
            <PdfViewer
              url={url}
              preview={
                index === 0 && item.cover
                  ? {
                      url: item.cover.previewUrl,
                      fallbackUrl: item.cover.url,
                      width: item.cover.width,
                      height: item.cover.height,
                      title: item.title,
                      reader: item.cover.reader,
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
      <ul className="mt-4 space-y-3">
        {item.attachments.map((file, index) =>
          pdfs.some((pdf) => pdf.query === `index=${index}`) ? null : (
            <li key={index}>
              <a
                href={
                  isTrustedAttachmentUrl(file.url)
                    ? `/api/content/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.id)}/file?index=${index}`
                    : (safeUrl(file.url) ?? undefined)
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-site-accent underline"
              >
                {file.name} ↗
              </a>
            </li>
          ),
        )}
        {item.externalUrl &&
          !pdfs.some((pdf) => pdf.query === "source=external") && (
            <li>
              <a
                href={safeUrl(item.externalUrl) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-site-accent underline"
              >
                관련 링크 열기 ↗
              </a>
            </li>
          )}
      </ul>
    </section>
  );
}

export const ResearchDetail = () => <DetailPage kind="research" />;
export const NoticeDetail = () => <DetailPage kind="notice" />;
