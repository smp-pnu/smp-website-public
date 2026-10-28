import type { ReactNode } from "react";

export function Spinner() {
  return <span className="ui-spinner" aria-hidden="true" />;
}

export function InlineLoading({ children }: { children: ReactNode }) {
  return <span className="ui-inline-loading" role="status"><Spinner />{children}</span>;
}

/** Reserved shapes keep the page stable. Only the small status indicator moves. */
export function LoadingState({ label = "자료를 불러오는 중…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className="ui-loading" aria-busy="true">
    <InlineLoading>{label}</InlineLoading>
    <div className="ui-skeletons" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div className="ui-skeleton-row" key={i}><span /><span /><span /></div>)}</div>
  </div>;
}
