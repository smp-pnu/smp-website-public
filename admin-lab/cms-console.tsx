import { InlineLoading } from "./ui/loading";
import { useEntryEditor } from "./cms/use-entry-editor";
import { useEntrySelection } from "./cms/use-entry-selection";
import { useCmsTask } from "./cms/use-cms-task";
import { useAdminHistory } from "./use-admin-history";
import { EntryEditor } from "./cms/entry-editor";
import { EntryList } from "./cms/entry-list";
import { RecruitmentEditor } from "./cms/recruitment-editor";
import { request } from "./cms/api";
import { useEntryList } from "./cms/use-entry-list";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry } from "../cms/model";
import type { ContentItem } from "../lib/content-model";
import { AdminFrame } from "./admin-frame";
import { api } from "./server-storage";
import { useConfirmation } from "./confirm";
import { StorageSettings } from "./storage-settings";
import { OperationsDashboard } from "./operations-dashboard";
import { MemberImport } from "./member-import";
import { MemberCohorts } from "./member-cohorts";
import { CmsUpload } from "./cms-upload";
import {
  readAdminRoute,
  writeAdminRoute,
  writeAdminSection,
  saveUploadReturn,
  readUploadReturn,
  clearUploadReturn,
  type AdminSection,
} from "./admin-navigation";
import { SecuritySettings, type SecurityControls } from "./security-settings";
import type { DropPlacement } from "./library-model";
export function CmsConsole({
  active,
  onLogout,
  security,
}: {
  active: boolean;
  onLogout?: () => Promise<void>;
  security?: SecurityControls;
}) {
  const initialRoute = useRef(readAdminRoute(location.hash));
  const [section, setSection] = useState<AdminSection>(
      initialRoute.current.section,
    ),
    [q, setQ] = useState(initialRoute.current.q),
    [group, setGroup] = useState(initialRoute.current.group),
    [filter, setFilter] = useState(initialRoute.current.filter),
    [page, setPage] = useState(initialRoute.current.page);
  const { busy, setBusy, error, setError, message, setMessage, running, run } =
    useCmsTask();
  const [tick, setTick] = useState(0);
  const [memberImportOpen, setMemberImportOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<string | undefined>(
    () => readUploadReturn()?.target,
  );
  const [uploadTitle, setUploadTitle] = useState<string | undefined>(
    () => readUploadReturn()?.title,
  );
  const [uploadReturn, setUploadReturn] = useState(() => readUploadReturn());
  const [childBusy, setChildBusy] = useState(false),
    [childDirty, setChildDirty] = useState(false);
  const navigationBusy =
    busy || childBusy || (section === "security" && !!security?.busy);
  const cohortOverview = useRef({ query: "", filter: "all" });

  const confirm = useConfirmation();
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const editor = useEntryEditor({
    active,
    busy,
    run,
    setError,
    setMessage,
    reload,
  });
  const { selected, form, change, uploadPhoto, save, action, setForm } = editor;
  const dirty = childDirty || editor.dirty;
  const {
    data,
    loading,
    error: loadError,
  } = useEntryList({ section, q, group, filter, page, tick, onPage: setPage });
  const batch = useEntrySelection({
    active,
    busy,
    loading,
    scope: JSON.stringify([section, q, group, filter]),
    run,
    setError,
    setMessage,
    reload,
  });
  const {
    checked,
    batchProgress,
    batchResult,
    stopping,
    toggleChecked,
    bulkAction,
  } = batch;
  // Direct links and refreshes must load the same key list as menu navigation.
  const openSecurity = useRef(security?.onOpen);
  openSecurity.current = security?.onOpen;
  useEffect(() => {
    if (section === "security") openSecurity.current?.();
  }, [section]);
  useEffect(() => {
    void api("/storage/maintenance", { method: "POST" }).catch(() => {});
  }, []);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty || navigationBusy || batchProgress) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, navigationBusy, !!batchProgress]);
  const canLeave = async () =>
    !navigationBusy &&
    !running.current &&
    ((!dirty && !memberImportOpen) ||
      (await confirm("저장하지 않은 변경·가져오기 내용을 닫고 이동할까요?")));
  const go = async (
    next: typeof section,
    state = "all",
    push = true,
    guard = true,
  ) => {
    if (guard && !(await canLeave())) return false;
    setSection(next);
    if (push) writeAdminSection(next);
    setChildDirty(false);
    cohortOverview.current = { query: "", filter: state };
    setMemberImportOpen(false);
    editor.clear();
    setQ("");
    setGroup("");
    setPage(1);
    setFilter(state);
    setError("");
    setMessage("");
    return true;
  };
  useAdminHistory(canLeave, async (route) => {
    await go(route.section, route.filter, false, false);
    setQ(route.q);
    setGroup(route.group);
    setPage(route.page);
    if (route.entry)
      await run(() =>
        editor.load(route.entry!, route.section as Entry["kind"]),
      );
  });
  useEffect(() => {
    const route = initialRoute.current;
    if (route.entry)
      void run(() => editor.load(route.entry!, route.section as Entry["kind"]));
  }, []);
  const listRoute = { section, q, group, filter, page };
  const updateList = (patch: Partial<typeof listRoute>) => {
    if (patch.q !== undefined) setQ(patch.q);
    if (patch.group !== undefined) setGroup(patch.group);
    if (patch.filter !== undefined) setFilter(patch.filter);
    if (patch.page !== undefined) setPage(patch.page);
    writeAdminRoute({ ...listRoute, ...patch }, true);
  };
  const openUpload = async (target?: string) => {
    const title =
      target && selected
        ? (selected.draft.item as ContentItem).title
        : undefined;
    if (await go("upload")) {
      setUploadTarget(target);
      setUploadTitle(title);
      clearUploadReturn();
      setUploadReturn(null);
    }
  };
  const importUpload = async (id: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const entry: Entry = await request("/import-upload", "POST", {
        id,
        target: uploadTarget,
      });
      setSection("research");
      writeAdminRoute({ section: "research", entry: entry.id });
      setUploadTarget(undefined);
      setUploadTitle(undefined);
      setChildDirty(false);
      clearUploadReturn();
      setUploadReturn(null);
      editor.select(entry);
      setMessage(
        "리포트 초안을 준비했습니다. 내용을 확인하고 ‘게시’를 눌러 공개하세요.",
      );
      reload();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const openCohort = (generation: number, fresh = false) => {
    if (busy) return;
    if (!group) cohortOverview.current = { query: q, filter };
    writeAdminRoute({
      section: "members",
      group: String(generation),
      filter: fresh ? "all" : filter,
    });
    setGroup(String(generation));
    setQ("");
    // A new cohort must start with a usable empty list, even from the trash tab.
    setFilter(fresh ? "all" : filter);
    setPage(1);
    setError("");
    setMessage("");
  };
  const backToCohorts = () => {
    if (busy) return;
    writeAdminRoute({
      section: "members",
      q: cohortOverview.current.query,
      filter: cohortOverview.current.filter,
    });
    setGroup("");
    setQ(cohortOverview.current.query);
    setFilter(cohortOverview.current.filter);
    setPage(1);
    batch.clear();
    setError("");
    setMessage("");
  };
  const open = async (id: string) => {
    if (!(await canLeave())) return;
    await run(async () => {
      batch.clear();
      const entry = await editor.load(id, section as Entry["kind"]);
      writeAdminRoute({ ...listRoute, entry: entry.id });
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
  };
  return (
    <AdminFrame
      viewKey={`${section}:${selected?.id ?? group}:${memberImportOpen}:${page}`}
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
      onSecurity={security ? () => void go("security") : undefined}
      onLogout={
        onLogout
          ? async () => {
              if (await canLeave()) {
                try {
                  await onLogout();
                } catch (e) {
                  setError((e as Error).message);
                }
              }
            }
          : undefined
      }
      busy={navigationBusy}
    >
      {busy && !batch.batchProgress && <div className="cms-task-status"><InlineLoading>요청을 처리하는 중…</InlineLoading></div>}
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
        <OperationsDashboard
          onNavigate={(kind, state) => void go(kind, state)}
          onStorage={() => void go("storage")}
          onUpload={() => void openUpload()}
        />
      ) : section === "security" ? (
        security ? (
          <SecuritySettings {...security} />
        ) : (
          <p>로그인·인수인계를 지원하지 않는 환경입니다.</p>
        )
      ) : section === "upload" ? (
        <CmsUpload
          key={uploadTarget ?? "new"}
          target={uploadTarget}
          targetTitle={uploadTitle}
          onBack={() => void go("research")}
          onImport={importUpload}
          onBusy={setChildBusy}
          onDirty={setChildDirty}
          onStorage={() =>
            void go("storage").then((ok) => {
              if (ok) {
                saveUploadReturn(uploadTarget, uploadTitle);
                setUploadReturn(readUploadReturn());
              }
            })
          }
          onOpen={async (id) => {
            if (!(await go("research"))) return;
            await open(id);
          }}
        />
      ) : section === "storage" ? (
        <StorageSettings
          onBusy={setBusy}
          onChange={reload}
          onReturnUpload={
            uploadReturn
              ? () =>
                  void go("upload").then((ok) => {
                    if (ok) {
                      setUploadTarget(uploadReturn.target);
                      setUploadTitle(uploadReturn.title);
                      clearUploadReturn();
                      setUploadReturn(null);
                    }
                  })
              : undefined
          }
        />
      ) : section === "recruitment" ? (
        <RecruitmentEditor
          active={active}
          onBusy={setChildBusy}
          onDirty={setChildDirty}
        />
      ) : section === "members" && memberImportOpen ? (
        <MemberImport
          initialGeneration={group}
          onBusy={setBusy}
          onClose={() =>
            void canLeave().then((ok) => {
              if (ok) setMemberImportOpen(false);
            })
          }
          onComplete={(generation, count, skipped) => {
            setMemberImportOpen(false);
            writeAdminRoute({
              section: "members",
              group: String(generation),
              filter: "draft",
            });
            setGroup(String(generation));
            setQ("");
            setFilter("draft");
            setPage(1);
            batch.clear();
            setMessage(
              `${count}명을 비공개 초안으로 등록했습니다.${skipped ? ` 중복 ${skipped}명은 제외했습니다.` : ""} 명단을 확인하고 선택하여 일괄 공개할 수 있습니다.`,
            );
            reload();
          }}
        />
      ) : selected && form ? (
        <EntryEditor
          key={selected.id}
          selected={selected}
          form={form}
          onBusy={setChildBusy}
          onDirty={setChildDirty}
          group={group}
          busy={busy || childBusy}
          dirty={dirty}
          onBack={() =>
            void canLeave().then((ok) => {
              if (ok) {
                editor.clear();
                writeAdminRoute(listRoute);
                reload();
              }
            })
          }
          onSave={() => void save()}
          onReplacePdf={() => void openUpload(selected.id)}
          onAction={(name) => void action(name)}
          change={change}
          onPhoto={uploadPhoto}
          onBlocks={(blocks) => setForm((p) => (p ? { ...p, blocks } : p))}
        />
      ) : section === "members" && !group ? (
        <MemberCohorts
          query={q}
          filter={filter}
          refresh={tick}
          onQuery={setQ}
          onFilter={setFilter}
          onOpen={openCohort}
          onImport={() => {
            cohortOverview.current = { query: q, filter };
            setMemberImportOpen(true);
            setError("");
            setMessage("");
          }}
        />
      ) : (
        <EntryList
          section={section}
          data={data}
          group={group}
          q={q}
          filter={filter}
          page={page}
          busy={busy}
          loading={loading}
          loadError={loadError}
          checked={checked}
          batchResult={batchResult}
          batchProgress={batchProgress}
          stopping={stopping}
          onCohorts={backToCohorts}
          onImport={() => {
            setMemberImportOpen(true);
            setError("");
            setMessage("");
          }}
          onCreate={() => {
            batch.clear();
            if (section === "research") void openUpload();
            else
              void editor.create(section, group, data.items).then((entry) => {
                if (entry) writeAdminRoute({ ...listRoute, entry: entry.id });
              });
          }}
          onQuery={(value) => updateList({ q: value, page: 1 })}
          onGroup={(value) => {
            if (section === "members") openCohort(Number(value));
            else {
              updateList({ group: value, page: 1 });
            }
          }}
          onFilter={(value) => updateList({ filter: value, page: 1 })}
          onRefresh={reload}
          onOpen={(id) => void open(id)}
          onPage={(value) => updateList({ page: value })}
          onAction={(name) => void bulkAction(name)}
          onCheck={toggleChecked}
          onClear={batch.clear}
          onStop={batch.stop}
          move={move}
        />
      )}
    </AdminFrame>
  );
}
