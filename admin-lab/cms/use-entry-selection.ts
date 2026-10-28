import { useEffect, useRef, useState } from "react";
import type { Entry } from "../../cms/model";
import { useConfirmation } from "../confirm";
import {
  actionLabels,
  canApply,
  runCmsBatch,
  selectEntries,
  type BatchProgress,
  type BatchResult,
  type CmsAction,
} from "../cms-bulk";
import { request } from "./api";
import { title } from "./presentation";
import type { CmsTask } from "./use-cms-task";
export function useEntrySelection({
  active,
  busy,
  loading,
  scope,
  run,
  setError,
  setMessage,
  reload,
}: {
  active: boolean;
  busy: boolean;
  loading: boolean;
  scope: string;
  run: CmsTask["run"];
  setError: (message: string) => void;
  setMessage: (message: string) => void;
  reload: () => void;
}) {
  const [checked, setChecked] = useState<Entry[]>([]),
    [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null),
    [batchResult, setBatchResult] = useState<BatchResult | null>(null),
    [stopping, setStopping] = useState(false);
  const stopBatch = useRef(false),
    confirm = useConfirmation();
  const clear = () => {
    setChecked([]);
    setBatchResult(null);
  };
  useEffect(() => {
    setChecked([]);
    setBatchResult(null);
  }, [scope]);
  const toggleChecked = (entries: Entry[], value: boolean) => {
    if (busy || loading) return;
    try {
      setChecked(selectEntries(checked, entries, value));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const bulkAction = async (action: CmsAction) => {
    if (busy || loading) return;
    const targets = checked.filter((e) => canApply(e, action));
    if (!targets.length) return;
    const explanations: Record<CmsAction, string> = {
      approve: active
        ? `저장된 초안을 공식 사이트에 공개합니다.${targets.some((entry) => entry.kind === "research") ? " PDF는 전체 페이지 준비 후 공개됩니다." : ""}`
        : "전환 준비본으로 승인합니다. 공식 사이트에는 아직 반영되지 않습니다.",
      withdraw: "공식 사이트에서 내려갑니다. 저장된 초안과 파일은 유지됩니다.",
      trash:
        "공식 사이트에서도 내려가며 휴지통으로 이동합니다. 30일 동안 복원할 수 있습니다. 이후 앱이 보관하는 파일을 정리하며, 이전 Drive 원본은 보존합니다.",
      restore:
        "휴지통에서 비공개 초안으로 복원합니다. 다시 공개하려면 공개 버튼을 눌러 주세요.",
    };
    if (
      !(await confirm(
        `${targets.length}개를 ${actionLabels[action]} 처리할까요? ${explanations[action]}${checked.length > targets.length ? ` 이미 해당 상태이거나 준비 중인 ${checked.length - targets.length}개는 제외합니다.` : ""}`,
        {
          title: `선택 자료 ${actionLabels[action]}`,
          acceptLabel: `${targets.length}개 ${actionLabels[action]}`,
          preview: targets.map((e) => title(e)).join("\n"),
          previewLabel: "처리할 자료 목록",
        },
      ))
    )
      return;
    await run(async () => {
      stopBatch.current = false;
      setStopping(false);
      setBatchResult(null);
      try {
        const result = await runCmsBatch(
          targets,
          action,
          (entry, name) =>
            request(`/entry/${entry.id}/${name}`, "POST", {
              revision: entry.revision,
            }),
          setBatchProgress,
          () => stopBatch.current,
        );
        setBatchResult(result);
        const left = new Set([
          ...result.failures.map((e) => e.id),
          ...result.remaining,
        ]);
        setChecked((previous) => previous.filter((e) => left.has(e.id)));
        setMessage(
          `${result.completed.length}개 ${actionLabels[action]} 요청을 완료했습니다.${result.pending ? ` 이 중 ${result.pending}개는 PDF 준비 후 공개됩니다.` : ""}${result.remaining.length ? ` ${result.remaining.length}개는 아직 처리하지 않았습니다.` : ""}`,
        );
      } finally {
        setBatchProgress(null);
        reload();
      }
    });
  };
  return {
    checked,
    batchProgress,
    batchResult,
    stopping,
    toggleChecked,
    bulkAction,
    clear,
    stop: () => {
      stopBatch.current = true;
      setStopping(true);
    },
  };
}
