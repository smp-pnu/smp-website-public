import { LoadingState, InlineLoading } from "../ui/loading";
import { EmptyState } from "../ui/empty-state";
import { AdminSelect } from "../ui/select";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, RefreshCw } from "lucide-react";
import type { Entry, Kind } from "../../cms/model";
import type { ContentItem } from "../../lib/content-model";
import type { Member } from "../../lib/member-model";
import type { DropPlacement } from "../library-model";
import { useListReorder } from "../use-list-reorder";
import { DragHandle, DragPreview } from "../reorder-ui";
import { ListPagination } from "../list-pagination";
import { CmsBulkControls, PageSelection } from "../cms-bulk-controls";
import type { BatchProgress, BatchResult, CmsAction } from "../cms-bulk";
import { names, status, statusTone, title } from "./presentation";
import type { EntryListData } from "./use-entry-list";
type Props = {
  section: Kind;
  data: EntryListData;
  group: string;
  q: string;
  filter: string;
  page: number;
  busy: boolean;
  loading: boolean;
  loadError: string;
  checked: Entry[];
  batchResult: BatchResult | null;
  batchProgress: BatchProgress | null;
  stopping: boolean;
  onCohorts: () => void;
  onImport: () => void;
  onCreate: () => void;
  onQuery: (q: string) => void;
  onGroup: (g: string) => void;
  onFilter: (f: string) => void;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onPage: (page: number) => void;
  onAction: (action: CmsAction) => void;
  onCheck: (entries: Entry[], checked: boolean) => void;
  onClear: () => void;
  onStop: () => void;
  move: (from: string, to: string, placement: DropPlacement) => Promise<void>;
};
export function EntryList({
  section,
  data,
  group,
  q,
  filter,
  page,
  busy,
  loading,
  loadError,
  checked,
  batchResult,
  batchProgress,
  stopping,
  onCohorts,
  onImport,
  onCreate,
  onQuery,
  onGroup,
  onFilter,
  onRefresh,
  onOpen,
  onPage,
  onAction,
  onCheck,
  onClear,
  onStop,
  move,
}: Props) {
  const checkedIds = new Set(checked.map((e) => e.id));
  const visibleChecked = data.items.filter((e) => checkedIds.has(e.id)).length;
  const reorder = useListReorder(move);
  return (
    <>
      {section === "members" && (
        <div className="detail-navigation">
          <button disabled={busy} onClick={onCohorts}>
            <ArrowLeft size={15} />
            기수 목록으로
          </button>
        </div>
      )}
      <header className="page-heading">
        <div>
          <h1>{section === "members" ? `${group}기 명단` : names[section]}</h1>
          <p>
            {loading
              ? <InlineLoading>자료를 불러오는 중…</InlineLoading>
              : loadError
                ? "목록을 불러오지 못했습니다."
                : `${data.total.toLocaleString()}건`}{" "}
            ·{" "}
            {section === "members"
              ? "회장 → 부회장 → 기장 → 가나다순으로 표시됩니다."
              : "드래그한 항목을 파란 선에 놓아 순서를 바꿉니다."}
          </p>
        </div>
        <div className="cms-import-actions">
          {section === "members" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                onImport();
              }}
            >
              엑셀로 가져오기
            </button>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => onCreate()}
          >
            <Plus size={16} />
            {section === "research"
              ? "리포트 등록"
              : section === "members"
                ? "회원 추가"
                : "새로 만들기"}
          </button>
        </div>
      </header>
      <nav className="list-tabs" aria-label="게시 상태">
        {[
          ["all", "전체"],
          ["public", "공개"],
          ["draft", "초안·수정"],
          ["trash", "휴지통"],
        ].map(([k, v]) => (
          <button
            key={k}
            disabled={busy}
            aria-pressed={filter === k}
            onClick={() => {
              onFilter(k);
            }}
          >
            {v}
          </button>
        ))}
      </nav>
      <div className="cms-filters">
        <input
          aria-label="관리 자료 검색"
          disabled={busy}
          placeholder={
            section === "members"
              ? "이름 검색"
              : section === "notice"
                ? "공지 제목 검색"
                : "제목·기업명·종목코드 검색"
          }
          value={q}
          onChange={(e) => {
            onQuery(e.target.value);
          }}
        />
        {section !== "notice" && (
          <AdminSelect
            aria-label="기간·기수"
            disabled={busy}
            value={group}
            onValueChange={(next) => {
              onGroup(next);
            }}
          >
            {section !== "members" && <option value="">전체 학기</option>}
            {group && !data.groups.includes(group) && (
              <option value={group}>
                {group}
                {section === "members" ? "기" : ""}
              </option>
            )}
            {data.groups.map((g) => (
              <option key={g} value={g}>
                {g}
                {section === "members" ? "기" : ""}
              </option>
            ))}
          </AdminSelect>
        )}
        <button
          disabled={loading || busy}
          onClick={onRefresh}
          aria-label="목록 새로고침"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {loadError && (
        <div className="error-panel" role="alert">
          <p>{loadError}</p>
          <button className="secondary" onClick={onRefresh}>
            다시 불러오기
          </button>
        </div>
      )}
      {batchResult?.failures.length ? (
        <details className="cms-bulk-errors" open>
          <summary>
            {batchResult.failures.length}개 항목을 처리하지 못했습니다
          </summary>
          <p>
            실패하거나 미처리한 항목은 선택을 유지했습니다. 변경된 자료는 다시
            선택한 후 처리해 주세요.
          </p>
          <ul>
            {batchResult.failures.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong> — {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <CmsBulkControls
        entries={checked}
        visibleCount={visibleChecked}
        trash={filter === "trash"}
        disabled={busy || loading}
        progress={batchProgress}
        stopping={stopping}
        onAction={(action) => onAction(action)}
        onClear={() => onClear()}
        onStop={() => {
          onStop();
        }}
      />
      <p id="cms-order-help" className="sr-only">
        {section === "members"
          ? "같은 기수에서는 회장, 부회장, 기장, 가나다순으로 자동 정렬됩니다."
          : "손잡이를 끌어서 파란 삽입선에 놓으세요. 위·아래 버튼으로도 이동할 수 있습니다."}
      </p>
      <div
        ref={reorder.table}
        className={`report-table-wrap${reorder.dragged ? " is-reordering" : ""}`}
        aria-busy={loading}
      >
        <table className={`report-table managed-table cms-entry-table cms-entry-table--${section}`} role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th className="select-column">
                <PageSelection
                  count={visibleChecked}
                  total={data.items.length}
                  disabled={busy || loading}
                  onChange={(value) => onCheck(data.items, value)}
                /><span className="mobile-list-label">이 페이지 선택</span>
              </th>
              {section !== "members" && <th>순서</th>}
              <th>{section === "members" ? "이름" : "제목"}</th>
              <th>상태</th>
              {section === "members" && <th>기수</th>}
              <th>
                {section === "members"
                  ? "직책"
                  : section === "notice"
                    ? "분류"
                    : "학기 · 분류"}
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {data.items.map((e, index) => {
              const i = e.draft.item as ContentItem & Member;
              return (
                <tr
                  key={e.id}
                  role="row"
                  data-reorder-id={e.id}
                  className={[
                    checkedIds.has(e.id) ? "is-selected" : "",
                    reorder.dragged === e.id ? "is-drag-source" : "",
                    reorder.target?.id === e.id
                      ? `drop-${reorder.target.placement}`
                      : "",
                  ].join(" ")}
                >
                  <td role="cell" className="select-column">
                    <input
                      type="checkbox"
                      aria-label={`${title(e)} 선택`}
                      disabled={busy || loading}
                      checked={checkedIds.has(e.id)}
                      onChange={(event) => onCheck([e], event.target.checked)}
                    />
                  </td>
                  {section !== "members" && (
                    <td role="cell" className="order-column">
                      <div className="order-controls">
                        <DragHandle
                          reorder={reorder}
                          id={e.id}
                          title={title(e)}
                          disabled={
                            busy ||
                            loading ||
                            !!checked.length ||
                            filter === "trash"
                          }
                          helpId="cms-order-help"
                        />
                        <button
                          disabled={
                            busy ||
                            loading ||
                            !!checked.length ||
                            index === 0 ||
                            filter === "trash"
                          }
                          aria-label={`${title(e)} 위로 이동`}
                          onClick={() =>
                            void move(e.id, data.items[index - 1].id, "before")
                          }
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          disabled={
                            busy ||
                            loading ||
                            !!checked.length ||
                            index === data.items.length - 1 ||
                            filter === "trash"
                          }
                          aria-label={`${title(e)} 아래로 이동`}
                          onClick={() =>
                            void move(e.id, data.items[index + 1].id, "after")
                          }
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                  <td role="cell" className="entry-title">
                    <button
                      className="cms-title-button"
                      disabled={busy || loading}
                      onClick={() => onOpen(e.id)}
                    >
                      {title(e)}
                    </button>
                    <small>
                      {i.company
                        ? `${i.company} ${i.ticker ?? ""}`
                        : (i.department ?? i.date?.slice(0, 10))}
                    </small>
                  </td>
                  <td role="cell" className="entry-status">
                    <span
                      className={`status-badge ${statusTone(e)}`}
                    >
                      {status(e)}
                    </span>
                  </td>
                  {section === "members" && <td role="cell" className="entry-generation">{i.generation}기</td>}
                  <td role="cell" className="entry-meta">
                    {section === "members"
                      ? (i.roles ?? []).join(" · ") || "회원"
                      : [i.semester, i.category].filter(Boolean).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && (
          <LoadingState rows={5} />
        )}
        {!loading && !loadError && !data.items.length && (
          <EmptyState title="조건에 맞는 자료가 없습니다.">
            {section === "members"
              ? "조건에 맞는 회원이 없습니다. ‘엑셀로 가져오기’ 또는 ‘회원 추가’로 명단을 등록하세요."
                : "검색어나 게시 상태를 바꿔 보세요. 새 자료는 오른쪽 위 버튼에서 등록할 수 있습니다."}
          </EmptyState>
        )}
      </div>
      <DragPreview
        reorder={reorder}
        title={
          data.items.find((e) => e.id === reorder.dragged)
            ? title(data.items.find((e) => e.id === reorder.dragged)!)
            : ""
        }
        subtitle="게시 순서"
      />
      <ListPagination
        page={page}
        pages={Math.max(1, Math.ceil(data.total / 40))}
        disabled={loading || busy}
        onPage={onPage}
      />
    </>
  );
}
