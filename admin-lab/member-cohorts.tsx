import { LoadingState, InlineLoading } from "./ui/loading";
import { useEffect, useState } from "react";
import { api } from "./server-storage";
import type { MemberCohort } from "../cms/member-cohorts";
import { ListPagination } from "./list-pagination";
import "./member-cohorts.css";

type Props = {
  query: string;
  filter: string;
  refresh: number;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onOpen: (generation: number, fresh?: boolean) => void;
  onImport: () => void;
};

export function MemberCohorts({
  query,
  filter,
  refresh,
  onQuery,
  onFilter,
  onOpen,
  onImport,
}: Props) {
  const [items, setItems] = useState<MemberCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [generation, setGeneration] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setItems([]);
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void api(
          `/cms/member-cohorts?${new URLSearchParams({ q: query, state: filter })}`,
          { signal: controller.signal },
        )
          .then((r) => r.json())
          .then((data: { items: MemberCohort[] }) => {
            if (live) {
              setItems(data.items);
              setPage(1);
            }
          })
          .catch((e: Error) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, filter, refresh, tick]);

  return (
    <section className="member-cohorts">
      <header className="page-heading">
        <div>
          <h1>회원 명단</h1>
          <p>기수를 선택해 명단을 수정하고 공개 상태를 관리합니다.</p>
        </div>
        <div className="cms-import-actions">
          <button className="secondary" onClick={onImport}>
            엑셀로 가져오기
          </button>
          <button
            className="primary"
            onClick={() => {
              setAdding(!adding);
              setGeneration("");
            }}
          >
            기수 추가
          </button>
        </div>
      </header>
      {adding && (
        <form
          className="cohort-create"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(generation);
            if (Number.isInteger(n) && n >= 1 && n <= 999) onOpen(n, true);
          }}
        >
          <label>
            추가할 기수
            <input
              type="number"
              min="1"
              max="999"
              step="1"
              required
              value={generation}
              placeholder="예: 41"
              onChange={(e) => setGeneration(e.target.value)}
            />
          </label>
          <button className="primary" type="submit">
            명단 작성
          </button>
          <p>
            회원을 등록하면 기수 목록에 저장됩니다. 이미 있는 기수는 해당 명단을
            엽니다.
          </p>
        </form>
      )}
      <nav className="list-tabs" aria-label="기수별 게시 상태">
        {[
          ["all", "전체"],
          ["public", "공개 회원 있음"],
          ["draft", "초안·수정 있음"],
          ["trash", "휴지통"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="cms-filters">
        <input
          aria-label="기수·이름·학과 검색"
          placeholder="기수·이름·학과 검색"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <button disabled={loading} onClick={() => setTick((n) => n + 1)}>
          새로고침
        </button>
      </div>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <p className="field-help">
        {loading
          ? <InlineLoading>기수별 현황을 불러오는 중…</InlineLoading>
          : `${items.length}개 기수 · ${items.reduce((n, c) => n + c.total, 0).toLocaleString()}명`}
        {filter === "trash"
          ? " · 휴지통 인원 기준"
          : " · 각 기수의 전체 인원 기준. 공개 중인 수정 초안은 두 항목에 함께 집계됩니다."}
      </p>
      <div className="report-table-wrap" aria-busy={loading}>
        <table className="report-table cohort-table">
          <thead>
            <tr>
              <th>기수</th>
              <th>구분</th>
              <th>인원</th>
              <th>공개</th>
              <th>초안·수정</th>
              <th>최근 수정</th>
              <th>
                <span className="sr-only">명단 관리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.slice((page - 1) * 40, page * 40).map((c) => (
              <tr key={c.generation}>
                <td>
                  <button
                    className="cms-title-button"
                    disabled={loading}
                    onClick={() => onOpen(c.generation)}
                  >
                    {c.generation}기
                  </button>
                </td>
                <td>
                  {c.members && c.alumni
                    ? "MEMBERS · ALUMNI"
                    : c.members
                      ? "MEMBERS"
                      : "ALUMNI"}
                </td>
                <td>{c.total}명</td>
                <td>{c.published}명</td>
                <td>
                  {c.drafts ? (
                    <span className="cohort-drafts">{c.drafts}명</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {new Date(c.updatedAt).toLocaleDateString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </td>
                <td>
                  <button
                    className="text-button"
                    disabled={loading}
                    aria-label={`${c.generation}기 명단 관리`}
                    onClick={() => onOpen(c.generation)}
                  >
                    명단 관리 →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !items.length && <LoadingState label="기수별 명단을 준비하는 중…" rows={5} />}
        {!loading && !error && !items.length && (
          <p className="empty-state">
            조건에 맞는 기수가 없습니다. 기수를 추가하거나 엑셀 명단을
            가져오세요.
          </p>
        )}
      </div>
      {items.length > 40 && (
        <ListPagination
          page={page}
          pages={Math.ceil(items.length / 40)}
          disabled={loading}
          onPage={setPage}
        />
      )}
    </section>
  );
}
