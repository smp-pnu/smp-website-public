import { useCallback, useEffect, useState } from "react"
import { Plus, ArrowLeft, RefreshCw, ArrowUp, ArrowDown } from "lucide-react"
import { api } from "./server-storage"
import { NoticeEditor } from "./notice-editor"
import { newBlock, noticeState, orderNotices, type Notice, type NoticeSummary } from "./notice-model"
import { useConfirmation } from "./confirm"
import { moveListItem, type DropPlacement, type LibraryOrder } from "./library-model"
import { useListReorder } from "./use-list-reorder"
import { DragHandle, DragPreview } from "./reorder-ui"

async function loadLibrary(): Promise<{ rows: NoticeSummary[]; order: LibraryOrder }> {
  const [rows, order] = await Promise.all([
    api("/notices").then((r) => r.json()),
    api("/notices/order").then((r) => r.json()),
  ])
  return { rows, order }
}
export function Notices({
  onDirty,
  onBusy,
  onChange,
}: {
  onDirty: (v: boolean) => void
  onBusy: (v: boolean) => void
  onChange: () => void
}) {
  const [list, setList] = useState<NoticeSummary[]>([]),
    [selected, setSelected] = useState<Notice | null>(null),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1)
  const [order, setOrder] = useState<LibraryOrder>({ revision: 1, ids: [] })
  const confirm = useConfirmation(),
    locked = busy || uploading
  const refresh = useCallback(async () => {
    const { rows, order } = await loadLibrary()
    setList(rows)
    setOrder(order)
    onChange()
  }, [onChange])
  useEffect(() => {
    let alive = true
    setBusy(true)
    void loadLibrary()
      .then(({ rows, order }) => {
        if (alive) { setList(rows); setOrder(order) }
      })
      .catch((e) => {
        if (alive) setError(e.message)
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  useEffect(() => {
    onBusy(locked)
    return () => onBusy(false)
  }, [locked, onBusy])
  const run = async (work: () => Promise<void>) => {
    if (locked) return
    setBusy(true)
    setError("")
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const leave = async () => !dirty || (await confirm("저장하지 않은 공지 내용을 버리고 이동할까요?"))
  const mutate = async (action: string, fields?: Notice) => {
    if (!selected) return
    if (
      action === "approve" &&
      (dirty ||
        !(await confirm(
          "저장된 공지의 내용과 사진을 확인했나요? 시험 승인해도 운영 사이트에는 게시되지 않습니다.",
        )))
    )
      return
    if (
      ["trash", "remove"].includes(action) &&
      !(await confirm(
        action === "remove"
          ? "공지와 사진을 영구 삭제할까요?"
          : "공지를 휴지통으로 옮길까요? 저장하지 않은 변경은 사라집니다.",
      ))
    )
      return
    await run(async () => {
      const next = await (
        await api(`/notices/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: selected.revision,
            action,
            fields,
            reviewed: action === "approve",
          }),
        })
      ).json()
      setSelected(next)
      await refresh()
    })
  }
  const filtered = orderNotices(list, order.ids).filter(
    (n) =>
      (filter === "trash" ? !!n.trashedAt : !n.trashedAt) &&
      (filter !== "review" || n.approvedRevision !== n.revision) &&
      (filter !== "approved" || n.approvedRevision === n.revision) &&
      (!category || n.category === category) &&
      `${n.title} ${n.category} ${n.excerpt}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, pages)
  const manual = filter !== "trash"
  const sameGroup = (from: string, to: string) => {
    const a = list.find((n) => n.id === from), b = list.find((n) => n.id === to)
    return !!a && !!b && !a.trashedAt && !b.trashedAt && a.pinned === b.pinned
  }
  const move = async (from: string, to: string, placement?: DropPlacement) => {
    if (locked || selected || !manual || !sameGroup(from, to)) return
    const ids = moveListItem(order.ids, from, to, placement)
    if (ids === order.ids) return
    await run(async () => setOrder(await (await api("/notices/order", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: order.revision, ids }),
    })).json()))
  }
  const reorder = useListReorder(move, sameGroup)
  const { dragged, target: dropTarget, cancel: clearDrag } = reorder
  const moving = list.find((n) => n.id === dragged)
  useEffect(() => { clearDrag() }, [query, category, filter, page, locked, selected, clearDrag])
  return (
    <section className="content-area">
      {selected ? (
        <div className="detail-navigation">
          <button
            className="text-button"
            disabled={locked}
            onClick={async () => {
              if (await leave()) setSelected(null)
            }}
          >
            <ArrowLeft size={16} />
            공지 목록
          </button>
        </div>
      ) : null}
      <header className="page-heading">
        <div>
          <h1 tabIndex={-1}>{selected ? "공지 편집" : "공지사항"}</h1>
          <p>
            {selected
              ? "내용과 사진을 작성하고 미리보기로 확인하세요."
              : "분류와 상태로 찾고, 공지 본문과 사진을 한곳에서 관리합니다."}
          </p>
        </div>
        {!selected && (
          <button
            className="primary"
            disabled={locked}
            onClick={() =>
              void run(async () => {
                const n = await (
                  await api("/notices", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: "",
                      category: "공지",
                      date: [new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,"0"),String(new Date().getDate()).padStart(2,"0")].join("-"),
                      pinned: false,
                      blocks: [newBlock()],
                    }),
                  })
                ).json()
                setSelected(n)
                await refresh()
              })
            }
          >
            <Plus size={16} />
            공지 작성
          </button>
        )}
        {selected && <span className="status">{noticeState(selected)}</span>}
      </header>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {selected ? (
        <>
          <NoticeEditor
            key={`${selected.id}:${selected.revision}`}
            notice={selected}
            busy={busy}
            onDirty={setDirty}
            onUploadBusy={setUploading}
            onSave={(fields) => mutate("edit", fields)}
          />
          <footer className="approval">
            <div className="button-row">
              {selected.trashedAt ? (
                <>
                  <button disabled={locked} onClick={() => void mutate("restore")}>
                    복원
                  </button>
                  <button className="danger" disabled={locked} onClick={() => void mutate("remove")}>
                    영구 삭제
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary"
                    disabled={locked || dirty || selected.approvedRevision === selected.revision}
                    onClick={() => void mutate("approve")}
                  >
                    검토 완료 · 시험 승인
                  </button>
                  <button disabled={locked} onClick={() => void mutate("trash")}>
                    휴지통으로
                  </button>
                </>
              )}
            </div>
            <small>
              운영 사이트·Notion과 분리된 시험 공지입니다. 휴지통은 30일 뒤 다음 관리자 접속·목록 조회 시
              사진과 함께 정리됩니다.
            </small>
          </footer>
        </>
      ) : (
        <section className="report-library">
          <nav className="list-tabs" aria-label="공지 상태">
            {[
              ["all", "전체"],
              ["review", "초안"],
              ["approved", "시험 승인"],
              ["trash", "휴지통"],
            ].map(([v, label]) => (
              <button
                key={v}
                disabled={locked}
                aria-pressed={filter === v}
                onClick={() => {
                  setFilter(v)
                  setPage(1)
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="list-toolbar">
            <label className="search-field">
              <input
                value={query}
                placeholder="제목·분류·본문 앞부분 검색"
                aria-label="공지 검색"
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="sort-field"><span className="sr-only">공지 분류</span><select value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}}><option value="">모든 분류</option>{[...new Set(list.map(n=>n.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko")).map(v=><option key={v}>{v}</option>)}</select></label>
            <button
              className="icon-button"
              aria-label="공지 새로고침"
              disabled={locked}
              onClick={() => void run(refresh)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {manual && <p className="library-hint" id="notice-order-help">
            <span className="drag-help">손잡이를 끌어 파란 선 위치에 놓으세요. Esc로 취소할 수 있습니다. </span>
            화살표로도 순서를 바꿀 수 있습니다. 고정 공지는 위에 유지하며, 같은 그룹 안에서 이동 후 자동 저장됩니다.
          </p>}
          <div className={`report-table-wrap${dragged ? " is-reordering" : ""}`} ref={reorder.table}>
            <table className="report-table managed-table notice-table">
              <thead>
                <tr>
                  {manual && <th className="order-column" scope="col">순서</th>}
                  <th>제목</th>
                  <th>분류</th>
                  <th>상태</th>
                  <th>날짜</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * 20, current * 20).map((n, i) => {
                  const index = (current - 1) * 20 + i
                  const previous = filtered[index - 1], next = filtered[index + 1]
                  return <tr key={n.id} data-reorder-id={n.id}
                    className={[dragged === n.id ? "is-drag-source" : "", dropTarget?.id === n.id ? `drop-${dropTarget.placement}` : ""].filter(Boolean).join(" ") || undefined}>
                    {manual && <td className="order-column"><div className="order-controls">
                      <DragHandle reorder={reorder} id={n.id} title={n.title || "제목 없는 초안"} disabled={locked} helpId="notice-order-help" />
                      <button aria-label={`${n.title || "제목 없는 초안"} 위로 이동`} disabled={locked || !previous || !sameGroup(n.id, previous.id)} onClick={() => void move(n.id, previous.id)}><ArrowUp size={13} /></button>
                      <button aria-label={`${n.title || "제목 없는 초안"} 아래로 이동`} disabled={locked || !next || !sameGroup(n.id, next.id)} onClick={() => void move(n.id, next.id)}><ArrowDown size={13} /></button>
                    </div></td>}
                    <td className="notice-title">
                      <button
                        className="report-link"
                        disabled={locked}
                        onClick={() =>
                          void run(async () => setSelected(await (await api(`/notices/${n.id}`)).json()))
                        }
                      >
                        <span>
                          <strong>
                            {n.pinned ? "[고정] " : ""}
                            {n.title || "제목 없는 초안"}
                          </strong>
                          <small>{n.excerpt.slice(0, 65) || "내용 작성 전"}</small>
                        </span>
                      </button>
                    </td>
                    <td>{n.category}</td>
                    <td>
                      <span className="status">{noticeState(n)}</span>
                    </td>
                    <td className="tabular">{n.date}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          {moving && <DragPreview reorder={reorder} title={moving.title || "제목 없는 초안"} subtitle={moving.category || "공지"} />}
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {dropTarget ? `${list.find((n) => n.id === dropTarget.id)?.title || "제목 없는 초안"} ${dropTarget.placement === "before" ? "앞" : "뒤"}에 놓기`
              : dragged ? "공지 이동 중. 같은 그룹 안에서 이동할 수 있습니다. Esc로 취소할 수 있습니다." : ""}
          </span>
          {!filtered.length && (
            <p className="table-empty" role="status">
              {busy ? "공지를 불러오는 중입니다." : "표시할 공지가 없습니다."}
            </p>
          )}
          <footer className="list-footer">
            <span>{filtered.length}개 · 시험 공지 최대 100개</span>
            <nav className="pagination" aria-label="공지 목록 페이지">
              <button disabled={locked || current === 1} onClick={() => setPage(current - 1)}>
                이전
              </button>
              <span>
                {current} / {pages}
              </span>
              <button disabled={locked || current === pages} onClick={() => setPage(current + 1)}>
                다음
              </button>
            </nav>
          </footer>
        </section>
      )}
    </section>
  )
}
