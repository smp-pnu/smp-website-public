import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, RefreshCw } from "lucide-react";
import type { Entry, Kind, Payload } from "../cms/model";
import type { ContentItem } from "../lib/content-model";
import type { Member } from "../lib/member-model";
import type { Recruitment } from "../lib/recruitment";
import { AdminFrame } from "./admin-frame";
import { api } from "./server-storage";
import { useConfirmation } from "./confirm";
import {
  CmsBlocks,
  CmsBlocksPreview,
  mediaUrl,
  newCmsBlock,
} from "./cms-blocks";
import { photo } from "./notice-editor";
import { StorageSettings } from "./storage-settings";
import { OperationsDashboard } from "./operations-dashboard";
import { MemberImport } from "./member-import";
import { MemberCohorts } from "./member-cohorts";
import { CmsUpload } from "./cms-upload";
import {adminSection,writeAdminSection,saveUploadReturn,readUploadReturn,clearUploadReturn,type AdminSection} from "./admin-navigation";
import { SecuritySettings, type SecurityControls } from "./security-settings";
import { useListReorder } from "./use-list-reorder";
import { DragHandle, DragPreview } from "./reorder-ui";
import type { DropPlacement } from "./library-model";
import { ListPagination } from "./list-pagination";
import { CmsBulkControls, PageSelection } from "./cms-bulk-controls";
import { actionLabels, canApply, runCmsBatch, selectEntries, type BatchProgress, type BatchResult, type CmsAction } from "./cms-bulk";
const names = { research: "리포트", notice: "공지사항", members: "회원 명단" };
const status = (e: Entry) =>
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
const title = (e: Entry) =>
  "name" in e.draft.item ? e.draft.item.name : e.draft.item.title;
async function request(path: string, method = "GET", value?: unknown) {
  return (
    await api("/cms" + path, {
      method,
      ...(value !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(value),
          }
        : {}),
    })
  ).json();
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="cms-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function CmsConsole({
  active,
  onLogout,
  security,
}: {
  active: boolean;
  onLogout?: () => Promise<void>;
  security?: SecurityControls;
}) {
  const [section, setSection] = useState<AdminSection>(()=>adminSection(location.hash)),
    [q, setQ] = useState(""),
    [group, setGroup] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1);
  const [data, setData] = useState<{
      items: Entry[];
      total: number;
      groups: string[];
    }>({ items: [], total: 0, groups: [] }),
    [selected, setSelected] = useState<Entry | null>(null),
    [form, setForm] = useState<Payload | null>(null),
    [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0);
  const [checked, setChecked] = useState<Entry[]>([]),
    [batchProgress, setBatchProgress] = useState<BatchProgress|null>(null),
    [batchResult, setBatchResult] = useState<BatchResult|null>(null),
    [stopping, setStopping] = useState(false);
  const [memberImportOpen, setMemberImportOpen] = useState(false);
  const [uploadTarget,setUploadTarget] = useState<string|undefined>(()=>readUploadReturn()?.target);
  const [uploadTitle,setUploadTitle] = useState<string|undefined>(()=>readUploadReturn()?.title);
  const [uploadReturn,setUploadReturn] = useState(()=>readUploadReturn());
  const [childBusy,setChildBusy] = useState(false),[childDirty,setChildDirty] = useState(false);
  const navigationBusy = busy || childBusy || (section === "security" && !!security?.busy);
  const cohortOverview = useRef({ query: "", filter: "all" });
  const running = useRef(false), stopBatch = useRef(false);
  const checkedIds = new Set(checked.map(e=>e.id));
  const visibleChecked = data.items.filter(e=>checkedIds.has(e.id)).length;
  const confirm = useConfirmation(),
    dirty =
      childDirty || (!!selected && JSON.stringify(form) !== JSON.stringify(selected.draft));
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // Direct links and refreshes must load the same key list as menu navigation.
  const openSecurity = useRef(security?.onOpen);
  openSecurity.current = security?.onOpen;
  useEffect(() => {if(section === "security") openSecurity.current?.()}, [section]);
  useEffect(()=>{setChecked([]);setBatchResult(null)},[section,q,group,filter]);
  useEffect(() => {
    void api("/storage/maintenance", { method: "POST" }).catch(() => {});
  }, []);
  useEffect(() => {
    if (section === "storage" || section === "recruitment" || section === "dashboard" || section === "upload" || section === "security" || (section === "members" && !group)) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const timer = setTimeout(
      () => {
        void request(
          `/${section}?${new URLSearchParams({ q, group, state: filter === "trash" ? "all" : filter, trash: filter === "trash" ? "1" : "0", page: String(page) })}`,
        )
          .then((v) => {
            if (live) {
              setData(v);
              if(v.page !== page) setPage(v.page);
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [section, q, group, filter, page, tick]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty || batchProgress) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, !!batchProgress]);
  useEffect(() => {
    if (!selected?.pending || dirty) return;
    let live = true;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void request(`/entry/${selected.id}`)
        .then((e) => {
          if (live) {
            setSelected(e);
            setForm(e.draft);
          }
        })
        .catch(() => {});
    }, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected?.id, selected?.pending, dirty]);
  const canLeave = async () =>
    !navigationBusy && !running.current && ((!dirty && !memberImportOpen) || (await confirm("저장하지 않은 변경·가져오기 내용을 닫고 이동할까요?")));
  const go = async (next: typeof section, state = "all") => {
    if (!(await canLeave())) return false;
    setSection(next);
    writeAdminSection(next);
    setChildDirty(false);
    cohortOverview.current = { query: "", filter: state };
    setMemberImportOpen(false);
    setData({ items: [], total: 0, groups: [] });
    setSelected(null);
    setForm(null);
    setQ("");
    setGroup("");
    setPage(1);
    setFilter(state);
    setError("");
    setMessage("");
    return true;
  };
  const openUpload = async (target?:string) => {
    const title = target && selected ? (selected.draft.item as ContentItem).title : undefined;
    if (await go("upload")) {setUploadTarget(target);setUploadTitle(title);clearUploadReturn();setUploadReturn(null);}
  };
  const importUpload = async (id:string) => {
    if (running.current) return;
    running.current=true;setBusy(true);
    try {
      const entry:Entry = await request("/import-upload","POST",{id,target:uploadTarget});
      setSection("research");writeAdminSection("research");setUploadTarget(undefined);setUploadTitle(undefined);setChildDirty(false);
      clearUploadReturn();setUploadReturn(null);setSelected(entry);setForm(entry.draft);
      setMessage("리포트 초안을 준비했습니다. 내용을 확인하고 ‘게시’를 눌러 공개하세요.");reload();
    } finally {running.current=false;setBusy(false)}
  };
  const openCohort = (generation: number, fresh = false) => {
    if (busy) return;
    if (!group) cohortOverview.current = { query: q, filter };
    setGroup(String(generation));
    setQ("");
    // A new cohort must start with a usable empty list, even from the trash tab.
    setFilter(fresh ? "all" : filter);
    setPage(1);
    setData({ items: [], total: 0, groups: [] });
    setError(""); setMessage("");
  };
  const backToCohorts = () => {
    if (busy) return;
    setGroup("");
    setQ(cohortOverview.current.query);
    setFilter(cohortOverview.current.filter);
    setPage(1);
    setData({ items: [], total: 0, groups: [] });
    setChecked([]); setBatchResult(null);
    setError(""); setMessage("");
  };
  const open = async (id: string) => {
    if (!(await canLeave())) return;
    await run(async () => {
      const e = await request(`/entry/${id}`);
      setChecked([]);setBatchResult(null);
      setSelected(e);
      setForm(e.draft);
      setPreview(false);
    });
  };
  const toggleChecked = (entries:Entry[], value:boolean) => {
    if(busy || loading) return;
    try {setChecked(selectEntries(checked,entries,value));setError("")}
    catch(e) {setError((e as Error).message)}
  };
  const bulkAction = async (action:CmsAction) => {
    if(busy || loading) return;
    const targets = checked.filter(e=>canApply(e,action));
    if(!targets.length) return;
    const explanations:Record<CmsAction,string> = {
      approve:active ? "저장된 초안을 공식 사이트에 공개합니다. PDF는 전체 페이지 준비 후 공개됩니다." : "전환 준비본으로 승인합니다. 공식 사이트에는 아직 반영되지 않습니다.",
      withdraw:"공식 사이트에서 내려갑니다. 저장된 초안과 파일은 유지됩니다.",
      trash:"공식 사이트에서도 내려가며 휴지통으로 이동합니다. 30일 동안 복원할 수 있습니다. 이후 앱이 보관하는 파일을 정리하며, 이전 Drive 원본은 보존합니다.",
      restore:"휴지통에서 비공개 초안으로 복원합니다. 다시 공개하려면 공개 버튼을 눌러 주세요.",
    };
    if(!await confirm(`${targets.length}개를 ${actionLabels[action]} 처리할까요? ${explanations[action]}${checked.length>targets.length?` 이미 해당 상태이거나 준비 중인 ${checked.length-targets.length}개는 제외합니다.`:""}`,{
      title:`선택 자료 ${actionLabels[action]}`,acceptLabel:`${targets.length}개 ${actionLabels[action]}`,
      preview:targets.map(e=>title(e)).join("\n"),previewLabel:"처리할 자료 목록",
    })) return;
    await run(async()=>{
      stopBatch.current=false;setStopping(false);setBatchResult(null);
      try {
        const result = await runCmsBatch(targets,action,
          (entry,name)=>request(`/entry/${entry.id}/${name}`,"POST",{revision:entry.revision}),
          setBatchProgress,()=>stopBatch.current);
        setBatchResult(result);
        const left = new Set([...result.failures.map(e=>e.id),...result.remaining]);
        setChecked(previous=>previous.filter(e=>left.has(e.id)));
        setMessage(`${result.completed.length}개 ${actionLabels[action]} 요청을 완료했습니다.${result.pending?` 이 중 ${result.pending}개는 PDF 준비 후 공개됩니다.`:""}${result.remaining.length?` ${result.remaining.length}개는 아직 처리하지 않았습니다.`:""}`);
      } finally {setBatchProgress(null);reload()}
    });
  };
  const action = async (name: "approve" | "withdraw" | "trash" | "restore") => {
    if (!selected) return;
    if (dirty) {
      setError("변경한 내용을 먼저 저장해 주세요.");
      return;
    }
    if (
      name === "approve" &&
      !(await confirm(
        active
          ? "이 승인본을 공식 사이트에 게시할까요? 새 PDF는 전체 페이지 준비 후 반영됩니다."
          : "전환 준비본으로 승인할까요? 아직 공식 사이트는 바뀌지 않습니다.",
      ))
    )
      return;
    if (
      name === "trash" &&
      !(await confirm(
        "공개된 글도 즉시 내려갑니다. 휴지통으로 옮길까요? 30일 동안 복원할 수 있습니다. 이후 앱이 보관하는 파일을 정리하며, 이전 Drive 원본은 보존합니다.",
      ))
    )
      return;
    if (
      name === "withdraw" &&
      !(await confirm("공식 사이트에서 비공개로 전환할까요?"))
    )
      return;
    await run(async () => {
      const e = await request(`/entry/${selected.id}/${name}`, "POST", {
        revision: selected.revision,
      });
      setSelected(e);
      setForm(e.draft);
      setMessage(
        e.pending
          ? "PDF 페이지를 준비하고 있습니다. 보통 15분 이내 작업이 시작되며, 실패하면 이 화면에서 확인할 수 있습니다."
          : "반영했습니다.",
      );
      reload();
    });
  };
  const move = async (from: string, to: string, placement: DropPlacement) => {
      const e = data.items.find((e) => e.id === from);
      if (!e) return;
      await run(async () => {
        await request(`/entry/${from}/move`, "POST", {
          revision: e.revision,
          target: to,
          placement,
        });
        reload();
      });
    },
    reorder = useListReorder(move);
  const create = () => {
    if (section === "research") {void openUpload();return;}
    return run(async () => {
      setChecked([]);setBatchResult(null);
      if (section !== "members" && section !== "notice") return;
      const item =
        section === "members"
          ? {
              id: "",
              name: "새 회원",
              generation: Number(group) || 40,
              group: data.items.length && data.items.every(e => (e.draft.item as Member).group === "alumni") ? "alumni" : "members",
              department: "",
              year: "",
              roles: [],
            }
          : {
              id: "",
              kind: "notice",
              title: "새 공지사항",
              date: new Date().toLocaleDateString("sv-SE", {
                timeZone: "Asia/Seoul",
              }),
              summary: "",
              category: "공지",
              author: "SMP",
              pinned: false,
              externalUrl: null,
              attachments: [],
            };
      const e = await request(`/${section}`, "POST", {
        item,
        blocks: section === "notice" ? [newCmsBlock()] : [],
        cover: null,
      });
      setSelected(e);
      setForm(e.draft);
      reload();
    });
  };
  const change = (key: string, value: unknown) =>
    setForm((p) => (p ? { ...p, item: { ...p.item, [key]: value } } : p));
  const uploadPhoto = async (file: File) =>
    run(async () => {
      if (!selected) return;
      const r = await api(`/cms/entry/${selected.id}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await photo(file),
      });
      change("image", (await r.json()).url);
    });
  const selectedContent = form?.item as ContentItem | undefined,
    member = form?.item as Member | undefined;
  return (
    <AdminFrame
      active={
        section === "research"
          ? "reports"
          : section === "notice"
            ? "notices"
            : section
      }
      cmsActive={active}
      cmsEnabled
      onDashboard={() => void go("dashboard")}
      onReports={() => void go("research")}
      onNotices={() => void go("notice")}
      onMembers={() => void go("members")}
      onRecruitment={() => void go("recruitment")}
      onUpload={() => void openUpload()}
      onStorage={() => void go("storage")}
      onSecurity={
        security
          ? () => void go("security")
          : undefined
      }
      onLogout={
        onLogout
          ? async () => {
              if (await canLeave()) {try {await onLogout()} catch(e){setError((e as Error).message)}}
            }
          : undefined
      }
      busy={navigationBusy}
    >
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-panel" role="status">
          {message}
        </p>
      )}
      {section === "dashboard" ? (
        <OperationsDashboard onNavigate={(kind,state)=>void go(kind,state)} onStorage={()=>void go("storage")} onUpload={()=>void openUpload()} />
      ) : section === "security" ? (
        security ? <SecuritySettings {...security}/> : <p>로그인·인수인계를 지원하지 않는 환경입니다.</p>
      ) : section === "upload" ? (
        <CmsUpload key={uploadTarget??"new"} target={uploadTarget} targetTitle={uploadTitle}
          onBack={()=>void go("research")} onImport={importUpload} onBusy={setChildBusy} onDirty={setChildDirty}
          onStorage={()=>void go("storage").then(ok=>{if(ok){saveUploadReturn(uploadTarget,uploadTitle);setUploadReturn(readUploadReturn())}})}
          onOpen={async id=>{if(!await go("research"))return;await open(id)}}/>
      ) : section === "storage" ? (
        <StorageSettings onBusy={setBusy} onChange={reload}
          onReturnUpload={uploadReturn?()=>void go("upload").then(ok=>{if(ok){setUploadTarget(uploadReturn.target);setUploadTitle(uploadReturn.title);clearUploadReturn();setUploadReturn(null)}}):undefined}/>
      ) : section === "recruitment" ? (
        <RecruitmentEditor active={active} onBusy={setChildBusy} onDirty={setChildDirty}/>
      ) : section === "members" && memberImportOpen ? (
        <MemberImport initialGeneration={group} onBusy={setBusy}
          onClose={()=>void canLeave().then(ok=>{if(ok)setMemberImportOpen(false)})}
          onComplete={(generation,count,skipped)=>{setMemberImportOpen(false);setGroup(String(generation));setQ("");setFilter("draft");setPage(1);setChecked([]);setBatchResult(null);setMessage(`${count}명을 비공개 초안으로 등록했습니다.${skipped?` 중복 ${skipped}명은 제외했습니다.`:""} 명단을 확인하고 선택하여 일괄 공개할 수 있습니다.`);reload()}}/>
      ) : selected && form ? (
        <>
          <div className="detail-navigation">
            <button
              disabled={busy}
              onClick={() =>
                void canLeave().then((ok) => {
                  if (ok) {
                    setSelected(null);
                    setForm(null);
                    reload();
                  }
                })
              }
            >
              <ArrowLeft size={15} />
              {section === "members" ? `${group}기 명단으로` : "목록으로"}
            </button>
            <span>{status(selected)}</span>
          </div>
          <header className="page-heading">
            <div>
              <h1>{names[section]} 편집</h1>
              <p>
                {selected.source === "notion"
                  ? "기존 자료의 주소와 파일은 그대로 유지됩니다."
                  : "저장한 초안은 게시 버튼을 눌러야 공개됩니다."}
              </p>
            </div>
            <div className="cms-actions">
              {section === "research" && (
                <button
                  disabled={busy || dirty || !!selected.trashedAt}
                  onClick={() => void openUpload(selected.id)}
                >
                  PDF 교체
                </button>
              )}
              <button
                disabled={busy || !dirty || !!selected.trashedAt}
                onClick={() =>
                  void run(async () => {
                    const e = await request(`/entry/${selected.id}`, "PUT", {
                      revision: selected.revision,
                      payload: form,
                    });
                    setSelected(e);
                    setForm(e.draft);
                    setMessage(
                      "초안을 저장했습니다. 게시하면 사이트에 반영됩니다.",
                    );
                    reload();
                  })
                }
              >
                초안 저장
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  dirty ||
                  !!selected.trashedAt ||
                  (selected.pending && !selected.error)
                }
                onClick={() => void action("approve")}
              >
                {selected.error
                  ? "다시 게시"
                  : selected.pending
                    ? "준비 중…"
                    : "게시"}
              </button>
            </div>
          </header>
          <fieldset
            className="cms-form"
            disabled={busy || !!selected.trashedAt}
          >
            {section === "members" ? (
              <>
                <Field
                  label="이름"
                  value={member?.name}
                  onChange={(v) => change("name", v)}
                />
                <Field
                  label="기수"
                  value={member?.generation}
                  type="number"
                  onChange={(v) => change("generation", Number(v))}
                />
                <label className="cms-field">
                  구분
                  <select
                    value={member?.group}
                    onChange={(e) => change("group", e.target.value)}
                  >
                    <option value="members">MEMBERS</option>
                    <option value="alumni">ALUMNI</option>
                  </select>
                </label>
                <Field
                  label="학과"
                  value={member?.department}
                  onChange={(v) => change("department", v)}
                />
                <Field
                  label="학번 표시"
                  value={member?.year}
                  onChange={(v) => change("year", v)}
                />
                <div className="cms-field">
                  <span>직책</span>
                  <div className="cms-actions">
                    {["회장", "부회장", "기장"].map((role) => (
                      <label key={role}>
                        <input
                          type="checkbox"
                          checked={
                            member?.roles?.includes(role as never) ?? false
                          }
                          onChange={(e) =>
                            change(
                              "roles",
                              e.target.checked
                                ? [...(member?.roles ?? []), role]
                                : (member?.roles ?? []).filter(
                                    (r) => r !== role,
                                  ),
                            )
                          }
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="cms-field">
                  <span>프로필 사진</span>
                  {member?.image && (
                    <img
                      className="cms-avatar"
                      src={mediaUrl(member.image)}
                      alt="프로필"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void uploadPhoto(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  {member?.image && (
                    <button onClick={() => change("image", undefined)}>
                      사진 내리기
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <Field
                  label="제목"
                  value={selectedContent?.title}
                  onChange={(v) => change("title", v)}
                />
                <Field
                  label="게시일"
                  type="date"
                  value={selectedContent?.date?.slice(0, 10)}
                  onChange={(v) => change("date", v)}
                />
                <Field
                  label="분류"
                  value={selectedContent?.category}
                  onChange={(v) => change("category", v)}
                />
                <Field
                  label="작성자·팀"
                  value={selectedContent?.author}
                  onChange={(v) => change("author", v)}
                />
                {section === "research" ? (
                  <>
                    <Field
                      label="학기 (예: 2026-2)"
                      value={selectedContent?.semester}
                      onChange={(v) => change("semester", v || undefined)}
                    />
                    <Field
                      label="기업명"
                      value={selectedContent?.company}
                      onChange={(v) => change("company", v)}
                    />
                    <Field
                      label="종목코드"
                      value={selectedContent?.ticker}
                      onChange={(v) => change("ticker", v)}
                    />
                    <Field
                      label="업종"
                      value={selectedContent?.industry}
                      onChange={(v) => change("industry", v)}
                    />
                    <Field
                      label="보고서 종류"
                      value={selectedContent?.reportType}
                      onChange={(v) => change("reportType", v)}
                    />
                    <Field
                      label="활동"
                      value={selectedContent?.activity}
                      onChange={(v) => change("activity", v)}
                    />
                  </>
                ) : (
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedContent?.pinned}
                      onChange={(e) => change("pinned", e.target.checked)}
                    />
                    상단 고정
                  </label>
                )}
                <label className="cms-field cms-wide">
                  요약
                  <textarea
                    rows={3}
                    value={selectedContent?.summary}
                    onChange={(e) => change("summary", e.target.value)}
                  />
                </label>
              </>
            )}
          </fieldset>
          {section !== "members" && (
            <>
              <div className="cms-actions">
                <button
                  aria-pressed={!preview}
                  onClick={() => setPreview(false)}
                >
                  본문 편집
                </button>
                <button aria-pressed={preview} onClick={() => setPreview(true)}>
                  미리보기
                </button>
              </div>
              {preview ? (
                <CmsBlocksPreview blocks={form.blocks} />
              ) : (
                <CmsBlocks
                  id={selected.id}
                  blocks={form.blocks}
                  disabled={busy || !!selected.trashedAt}
                  onChange={(blocks) =>
                    setForm((p) => (p ? { ...p, blocks } : p))
                  }
                />
              )}
            </>
          )}
          <footer className="cms-actions cms-footer">
            {selected.trashedAt ? (
              <button disabled={busy} onClick={() => void action("restore")}>
                비공개 초안으로 복원
              </button>
            ) : (
              <>
                <button
                  disabled={busy || dirty || !selected.approvedRevision}
                  onClick={() => void action("withdraw")}
                >
                  비공개로 전환
                </button>
                <button
                  disabled={busy || dirty}
                  onClick={() => void action("trash")}
                >
                  휴지통으로 이동
                </button>
              </>
            )}
            {selected.kind !== "members" && selected.approvedRevision && (
              <a
                href={`https://pnusmp.com/${selected.kind}/${selected.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                게시된 페이지 보기 ↗
              </a>
            )}
          </footer>
          {selected.error && (
            <p className="error-panel">
              게시 준비에 실패했습니다. 파일 연결을 확인하고 ‘게시’를 다시 눌러
              주세요. 기존 공개본은 유지됩니다.
            </p>
          )}
        </>
      ) : section === "members" && !group ? (
        <MemberCohorts query={q} filter={filter} refresh={tick}
          onQuery={setQ} onFilter={setFilter} onOpen={openCohort}
          onImport={()=>{cohortOverview.current={query:q,filter};setMemberImportOpen(true);setError("");setMessage("")}} />
      ) : (
        <>
          {section === "members" && <div className="detail-navigation"><button disabled={busy} onClick={backToCohorts}><ArrowLeft size={15}/>기수 목록으로</button></div>}
          <header className="page-heading">
            <div>
              <h1>{section === "members" ? `${group}기 명단` : names[section]}</h1>
              <p>
                {data.total.toLocaleString()}건 ·{" "}
                {section === "members"
                  ? "회장 → 부회장 → 기장 → 가나다순으로 표시됩니다."
                  : "드래그한 항목을 파란 선에 놓아 순서를 바꿉니다."}
              </p>
            </div>
            <div className="cms-import-actions">
            {section === "members" && <button className="secondary" disabled={busy} onClick={()=>{setMemberImportOpen(true);setError("");setMessage("")}}>엑셀로 가져오기</button>}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void create()}
            >
              <Plus size={16} />
              {section === "research" ? "PDF 등록" : section === "members" ? "회원 추가" : "새로 만들기"}
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
                  setFilter(k);
                  setPage(1);
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
                  : "제목·기업명·종목코드 검색"
              }
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {section !== "notice" && <select
              aria-label="기간·기수"
              disabled={busy}
              value={group}
              onChange={(e) => {
                if(section === "members") openCohort(Number(e.target.value));
                else {setGroup(e.target.value);setPage(1);}
              }}
            >
              {section !== "members" && <option value="">전체 학기</option>}
              {section === "members" && !data.groups.includes(group) && <option value={group}>{group}기</option>}
              {data.groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                  {section === "members" ? "기" : ""}
                </option>
              ))}
            </select>}
            <button
              disabled={loading || busy}
              onClick={reload}
              aria-label="새로고침"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {batchResult?.failures.length ? <details className="cms-bulk-errors" open>
            <summary>{batchResult.failures.length}개 항목을 처리하지 못했습니다</summary>
            <p>실패하거나 미처리한 항목은 선택을 유지했습니다. 변경된 자료는 다시 선택한 후 처리해 주세요.</p>
            <ul>{batchResult.failures.map(e=><li key={e.id}><strong>{e.title}</strong> — {e.message}</li>)}</ul>
          </details> : null}
          <CmsBulkControls entries={checked} visibleCount={visibleChecked} trash={filter==="trash"}
            disabled={busy || loading} progress={batchProgress} stopping={stopping}
            onAction={action=>void bulkAction(action)} onClear={()=>setChecked([])}
            onStop={()=>{stopBatch.current=true;setStopping(true)}} />
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
            <table className="report-table managed-table">
              <thead>
                <tr>
                  <th className="select-column"><PageSelection count={visibleChecked} total={data.items.length} disabled={busy || loading}
                    onChange={value=>toggleChecked(data.items,value)} /></th>
                  {section !== "members" && <th>순서</th>}
                  <th>{section === "members" ? "이름" : "제목"}</th>
                  <th>상태</th>
                  {section === "members" && <th>기수</th>}
                  <th>
                    {section === "members" ? "직책" : section === "notice" ? "분류" : "학기 · 분류"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e, index) => {
                  const i = e.draft.item as ContentItem & Member;
                  return (
                    <tr
                      key={e.id}
                      data-reorder-id={e.id}
                      className={[
                        checkedIds.has(e.id) ? "is-selected" : "",
                        reorder.dragged === e.id ? "is-drag-source" : "",
                        reorder.target?.id === e.id
                          ? `drop-${reorder.target.placement}`
                          : "",
                      ].join(" ")}
                    >
                      <td className="select-column"><input type="checkbox" aria-label={`${title(e)} 선택`}
                        disabled={busy || loading} checked={checkedIds.has(e.id)} onChange={event=>toggleChecked([e],event.target.checked)} /></td>
                      {section !== "members" && (
                        <td className="order-column">
                          <div className="order-controls">
                            <DragHandle
                              reorder={reorder}
                              id={e.id}
                              title={title(e)}
                              disabled={busy || loading || !!checked.length || filter === "trash"}
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
                              aria-label="위로"
                              onClick={() =>
                                void move(
                                  e.id,
                                  data.items[index - 1].id,
                                  "before",
                                )
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
                              aria-label="아래로"
                              onClick={() =>
                                void move(
                                  e.id,
                                  data.items[index + 1].id,
                                  "after",
                                )
                              }
                            >
                              <ArrowDown size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                      <td>
                        <button
                          className="cms-title-button"
                          disabled={busy || loading}
                          onClick={() => void open(e.id)}
                        >
                          {title(e)}
                        </button>
                        <small>
                          {i.company
                            ? `${i.company} ${i.ticker ?? ""}`
                            : (i.department ?? i.date?.slice(0, 10))}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${e.approvedRevision === e.revision ? "ready" : ""}`}
                        >
                          {status(e)}
                        </span>
                      </td>
                      {section === "members" && <td>{i.generation}기</td>}
                      <td>
                        {section === "members"
                          ? (i.roles ?? []).join(" · ") || "회원"
                          : [i.semester, i.category]
                              .filter(Boolean)
                              .join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !data.items.length && (
              <p className="empty-state">{section === "members" ? "조건에 맞는 회원이 없습니다. ‘엑셀로 가져오기’ 또는 ‘회원 추가’로 명단을 등록하세요." : "조건에 맞는 자료가 없습니다."}</p>
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
          <ListPagination page={page} pages={Math.max(1, Math.ceil(data.total / 40))} disabled={loading || busy} onPage={setPage} />
        </>
      )}
    </AdminFrame>
  );
}
const localDateTime = (value: string | null | undefined) =>
  value
    ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16)
    : "";
function RecruitmentEditor({ active,onBusy,onDirty }: { active: boolean;onBusy:(busy:boolean)=>void;onDirty:(dirty:boolean)=>void }) {
  const [value, setValue] = useState<Recruitment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    confirm = useConfirmation();
  const [savedValue,setSavedValue] = useState<Recruitment|null>(null);
  const dirty = !!value && JSON.stringify(value)!==JSON.stringify(savedValue);
  useEffect(()=>{onBusy(busy);return()=>onBusy(false)},[busy,onBusy]);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty]);
  useEffect(() => {
    let live = true;
    void request("/recruitment")
      .then(v=>{if(live){setValue(v);setSavedValue(v)}})
      .catch((e) => {if(live)setError(e.message)});
    return ()=>{live=false};
  }, []);
  const labels: Record<string, string> = {
    period: "일정 표시",
    audience: "모집 대상",
    requirement: "활동 요건",
    capacity: "모집 인원",
    schedule: "활동 일정",
    location: "활동 장소",
    duration: "활동 기간",
    fees: "회비 안내",
    process: "전형 안내",
  };
  const change = (key: string, v: unknown) =>
    setValue((old) => (old ? { ...old, [key]: v } : old));
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>모집 안내</h1>
          <p>검증된 내용으로만 반영하며, 사이트 배포 후 표시됩니다.</p>
        </div>
      </header>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p role="status">저장했습니다. 다음 게시 작업에서 반영됩니다.</p>
      )}
      {value ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              if (
                !(await confirm(
                  active
                    ? "공식 모집 안내를 변경할까요?"
                    : "전환할 모집 안내를 저장할까요?",
                ))
              )
                return;
              setBusy(true);
              setError("");
              try {
                const saved = await request("/recruitment", "PUT", value);
                setValue(saved);setSavedValue(saved);
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <fieldset disabled={busy} className="cms-form">
            <Field
              label="모집 기수"
              type="number"
              value={value.generation}
              onChange={(v) => change("generation", Number(v))}
            />
            <label className="cms-field">
              상태
              <select
                value={value.status}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="upcoming">모집 예정</option>
                <option value="open">모집 중</option>
                <option value="closed">모집 마감</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={value.scheduleConfirmed}
                onChange={(e) => change("scheduleConfirmed", e.target.checked)}
              />
              일정 확정
            </label>
            <Field
              label="접수 시작"
              type="datetime-local"
              value={localDateTime(value.start)}
              onChange={(v) => change("start", v ? `${v}+09:00` : null)}
            />
            <Field
              label="접수 종료"
              type="datetime-local"
              value={localDateTime(value.end)}
              onChange={(v) => change("end", v ? `${v}+09:00` : null)}
            />
            <Field
              label="지원 링크"
              value={value.applicationUrl}
              onChange={(v) => change("applicationUrl", v || null)}
            />
            {Object.entries(labels).map(([k, label]) => (
              <label className="cms-field" key={k}>
                {label}
                <textarea
                  value={String(value[k as keyof Recruitment] ?? "")}
                  onChange={(e) => change(k, e.target.value)}
                />
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={busy}>
            모집 안내 저장
          </button>
        </form>
      ) : (
        <p role="status">불러오는 중…</p>
      )}
    </>
  );
}
