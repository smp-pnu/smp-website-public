import { useEffect, useState } from "react";
import type { Entry, Payload } from "../../cms/model";
import type { Member } from "../../lib/member-model";
import { useConfirmation } from "../confirm";
import { newCmsBlock } from "../cms-blocks";
import { photo } from "../notice-editor";
import { api } from "../server-storage";
import { request } from "./api";
import type { CmsTask } from "./use-cms-task";
export function useEntryEditor({
  active,
  busy,
  run,
  setError,
  setMessage,
  reload,
}: {
  active: boolean;
  busy: boolean;
  run: CmsTask["run"];
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  reload: () => void;
}) {
  const [selected, setSelected] = useState<Entry | null>(null),
    [form, setForm] = useState<Payload | null>(null);
  const dirty =
    !!selected && JSON.stringify(form) !== JSON.stringify(selected.draft);
  const confirm = useConfirmation();
  const select = (entry: Entry) => {
    setSelected(entry);
    setForm(entry.draft);
  };
  const clear = () => {
    setSelected(null);
    setForm(null);
  };
  const load = async (id: string, kind?: Entry["kind"]) => {
    const entry = await request<Entry>(`/entry/${id}`);
    if (kind && entry.kind !== kind)
      throw Error("해당 메뉴의 자료가 아닙니다.");
    select(entry);
    return entry;
  };
  useEffect(() => {
    if (!selected?.pending || dirty || busy) return;
    const controller = new AbortController();
    let inFlight = false;
    const timer = setInterval(() => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      void request<Entry>(
        `/entry/${selected.id}`,
        "GET",
        undefined,
        controller.signal,
      )
        .then((entry) => {
          if (!controller.signal.aborted) select(entry);
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    }, 15000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [selected?.id, selected?.pending, dirty, busy]);
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
          ? `이 승인본을 공식 사이트에 게시할까요?${selected.kind === "research" ? " 새 PDF는 전체 페이지 준비 후 반영됩니다." : ""}`
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
      const e = await request<Entry>(`/entry/${selected.id}/${name}`, "POST", {
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
  const create = (
    section: "members" | "notice",
    group: string,
    items: Entry[],
  ) => {
    return run(async () => {
      if (section !== "members" && section !== "notice") return;
      const item =
        section === "members"
          ? {
              id: "",
              name: "새 회원",
              generation: Number(group) || 40,
              group:
                items.length &&
                items.every((e) => (e.draft.item as Member).group === "alumni")
                  ? "alumni"
                  : "members",
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
      const e = await request<Entry>(`/${section}`, "POST", {
        item,
        blocks: section === "notice" ? [newCmsBlock()] : [],
        cover: null,
      });
      setSelected(e);
      setForm(e.draft);
      reload();
      return e;
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
  const save = () =>
    run(async () => {
      if (!selected || !form) return;
      const entry = await request<Entry>(`/entry/${selected.id}`, "PUT", {
        revision: selected.revision,
        payload: form,
      });
      setSelected(entry);
      setForm(entry.draft);
      setMessage("초안을 저장했습니다. 게시하면 사이트에 반영됩니다.");
      reload();
    });
  return {
    selected,
    form,
    dirty,
    select,
    clear,
    load,
    create,
    change,
    uploadPhoto,
    save,
    action,
    setForm,
  };
}
