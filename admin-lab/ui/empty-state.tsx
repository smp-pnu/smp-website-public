import { Search } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ui-empty"><Search size={28} strokeWidth={1.4} aria-hidden="true" /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
