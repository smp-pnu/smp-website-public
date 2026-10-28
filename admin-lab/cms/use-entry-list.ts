import { useEffect, useState } from "react";
import { request } from "./api";
import {
  entryListPath,
  type Query,
  type EntryListData,
} from "./entry-list-query";
export type { EntryListData } from "./entry-list-query";
const empty: EntryListData = { items: [], total: 0, groups: [] };
// A response belongs to one query. Old results never become actionable while a
// different page/filter is pending, and obsolete requests are cancelled.
export function useEntryList(query: Query) {
  const path = entryListPath(query),
    key = `${path}:${query.tick}`;
  const [result, setResult] = useState<{
    key: string;
    data: EntryListData;
    error: string;
    loading: boolean;
  }>({ key: "", data: empty, error: "", loading: true });
  const { onPage } = query;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setResult({ key, data: empty, error: "", loading: true });
    const timer = setTimeout(
      () => {
        void request<EntryListData & { page: number }>(
          path,
          "GET",
          undefined,
          controller.signal,
        )
          .then((data) => {
            if (controller.signal.aborted) return;
            setResult({ key, data, error: "", loading: false });
            if (data.page !== query.page) onPage(data.page);
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              setResult({
                key,
                data: empty,
                error: error.message,
                loading: false,
              });
          });
      },
      query.q ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, key, onPage, query.page, query.q]);
  if (!path) return { data: empty, error: "", loading: false };
  return result.key === key
    ? result
    : { data: empty, error: "", loading: true };
}
