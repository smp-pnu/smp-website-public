import Form from "next/form";
import { useApi } from "../api";
import { useSearch, Status } from "./state";
import { SEARCH_CACHE_TTL } from "@/lib/client-api-cache";
import type { SiteSearchEntry } from "@/lib/site-search-query";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageIntro } from "@/components/page-intro";
import { SearchField } from "@/components/search-field";
import { SiteSearchResults } from "@/components/site-search-results";
export function SearchPage() {
  const query = (useSearch().q ?? "").trim().slice(0, 100);
  const { value, error, retry } = useApi<{
    entries: SiteSearchEntry[];
    partial: boolean;
  }>("/api/search", SEARCH_CACHE_TTL);
  return (
    <>
      <SiteHeader />
      <main className="site-page min-h-[75svh] max-w-5xl">
        <PageIntro eyebrow="EXPLORE SMP" title="SEARCH">
          SMP의 리포트와 소식, 사람들을 한곳에서 찾아보세요.
        </PageIntro>
        <Form action="/search" className="mt-10" role="search">
          <SearchField
            key={query}
            id="search-query"
            label="검색어"
            name="q"
            maxLength={100}
            defaultValue={query}
            placeholder="검색어를 입력하세요"
          />
        </Form>
        {!query ? (
          <p className="py-20 text-center text-site-body">
            기업명, 리포트 제목, 이름 또는 학과를 입력해보세요.
          </p>
        ) : value ? (
          <SiteSearchResults query={query} index={value} />
        ) : (
          <Status error={error} retry={retry} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
