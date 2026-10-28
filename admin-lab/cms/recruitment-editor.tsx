import { LoadingState, InlineLoading } from "../ui/loading";
import { AdminSelect } from "../ui/select";
import { useEffect, useState } from "react";
import type { Recruitment } from "../../lib/recruitment";
import { useConfirmation } from "../confirm";
import { request } from "./api";
import { Field } from "./field";
const localDateTime = (value: string | null | undefined) =>
  value
    ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16)
    : "";
export function RecruitmentEditor({
  active,
  onBusy,
  onDirty,
}: {
  active: boolean;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState<Recruitment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    confirm = useConfirmation();
  const [attempt, setAttempt] = useState(0);
  const [savedValue, setSavedValue] = useState<Recruitment | null>(null);
  const dirty = !!value && JSON.stringify(value) !== JSON.stringify(savedValue);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    let live = true;
    setError("");
    void request<Recruitment>("/recruitment")
      .then((v) => {
        if (live) {
          setValue(v);
          setSavedValue(v);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
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
  const change = (key: string, v: unknown) => {
    setDone(false);
    setValue((old) => (old ? { ...old, [key]: v } : old));
  };
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
        <p className="success-panel" role="status">저장했습니다. 다음 게시 작업에서 반영됩니다.</p>
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
                const saved = await request<Recruitment>(
                  "/recruitment",
                  "PUT",
                  value,
                );
                setValue(saved);
                setSavedValue(saved);
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
            <h2 className="cms-section-title">모집 기본 정보</h2>
            <Field
              label="모집 기수"
              type="number"
              value={value.generation}
              onChange={(v) => change("generation", Number(v))}
            />
            <label className="cms-field">
              상태
              <AdminSelect disabled={busy} aria-label="모집 상태"
                value={value.status}
                onValueChange={(next) => change("status", next)}
              >
                <option value="upcoming">모집 예정</option>
                <option value="open">모집 중</option>
                <option value="closed">모집 마감</option>
              </AdminSelect>
            </label>
            <h2 className="cms-section-title">접수 일정</h2>
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
            <h2 className="cms-section-title">활동·지원 안내</h2>
            {Object.entries(labels).map(([k, label]) => (
              <label className={`cms-field ${k === "fees" || k === "process" ? "cms-wide" : ""}`} key={k}>
                {label}
                <textarea
                  value={String(value[k as keyof Recruitment] ?? "")}
                  onChange={(e) => change(k, e.target.value)}
                />
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={busy || !dirty}>
            {busy ? <InlineLoading>저장 중…</InlineLoading> : "모집 안내 저장"}
          </button>
        </form>
      ) : error ? (
        <button className="secondary" onClick={() => setAttempt((n) => n + 1)}>
          다시 불러오기
        </button>
      ) : (
        <LoadingState label="모집 안내를 불러오는 중…" rows={4} />
      )}
    </>
  );
}
