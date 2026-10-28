import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { useApi } from "../api";
import { useSearch, Status } from "./state";
import { sortContent, type ContentKind } from "@/lib/content-model";
import type { ContentResult } from "@/lib/notion-model";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageIntro } from "@/components/page-intro";
import { NoticeListing } from "@/components/notice-listing";
import { ContentList } from "@/components/content-list";
export function ListPage({ kind }: { kind: ContentKind }) {
  const { value, error, retry } = useApi<ContentResult>(`/api/catalog/${kind}`);
  const search = useSearch();
  const result = useMemo(
    () => value && { ...value, items: sortContent(value.items) },
    [value],
  );
  const { key, hash } = useLocation();
  const navigationType = useNavigationType();
  const restoredKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!result || !hash.startsWith("#content-") || restoredKey.current === key)
      return;
    restoredKey.current = key;
    // A cold list has no anchors when the router first restores scroll. Retry
    // once after its data arrives, while leaving saved Back/Forward positions alone.
    if (navigationType === "POP" && key !== "default") return;
    document
      .getElementById(hash.slice(1))
      ?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [result, key, hash, navigationType]);
  const content = result ? (
    <ContentList result={result} kind={kind} search={search} />
  ) : (
    <Status error={error} retry={retry} />
  );
  return (
    <>
      <SiteHeader />
      {kind === "notice" ? (
        <NoticeListing>{content}</NoticeListing>
      ) : (
        <main
          data-report-page="list"
          className="site-page min-h-[75svh] max-w-6xl"
        >
          <PageIntro eyebrow="SMP PUBLICATIONS" title="RESEARCH">
            부산대학교 금융투자학회 SMP의 기업·산업 분석 리포트입니다.
            기업명·종목코드·산업·발표 학기로 찾고, PDF 원문을 읽어보세요.
          </PageIntro>
          {content}
        </main>
      )}
      <SiteFooter />
    </>
  );
}

export const Research = () => <ListPage kind="research" />;
export const Notices = () => <ListPage kind="notice" />;
