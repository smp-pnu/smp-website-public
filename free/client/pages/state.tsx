import { useLocation } from "react-router";
export function useSearch() {
  return Object.fromEntries(new URLSearchParams(useLocation().search));
}
export function Status({
  error,
  retry,
}: {
  error?: Error;
  retry?: () => void;
}) {
  return (
    <div className="py-20 text-center leading-8 text-site-body">
      <p role={error ? "alert" : "status"}>
        {error?.message ?? "자료를 불러오는 중입니다."}
      </p>
      {error && retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-5 min-h-11 rounded-[4px] border border-site-line px-5 text-sm text-site-accent hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-site-accent"
        >
          다시 불러오기
        </button>
      )}
    </div>
  );
}
